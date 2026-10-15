import { opendir, realpath } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { visit } from 'jsonc-parser';
import { audit, applyDecisions, AuditError, MAX_INPUT_BYTES, TOOL_VERSION } from '../core/index';
import type { AuditPolicy } from '../core/types';
import {
  CliError,
  isWithin,
  readTextFile,
  resolveOutputLocation,
  rootedPath,
  type ByteBudget,
} from './io';
import type { BatchIssue, BatchPairResult, BatchReport, PairDefinition } from './types';

export const MAX_BATCH_PAIRS = 10_000;
export const MAX_BATCH_BYTES = 256 * 1024 * 1024;
export const MAX_BATCH_REPORT_BYTES = 128 * 1024 * 1024;
export const MAX_CONFIG_BYTES = 4 * 1024 * 1024;
const MAX_INVENTORY_ENTRIES = 100_000;

function strictJson(text: string): unknown {
  let depth = 0;
  let nodes = 0;
  const keys: Set<string>[] = [];
  const enter = (): void => {
    if (++depth > 64 || ++nodes > 200_000)
      throw new CliError('PAIRS_LIMIT', 'Pairs configuration exceeds its nesting or node budget.');
  };
  visit(
    text,
    {
      onObjectBegin: () => {
        enter();
        keys.push(new Set());
      },
      onObjectEnd: () => {
        depth--;
        keys.pop();
      },
      onArrayBegin: enter,
      onArrayEnd: () => {
        depth--;
      },
      onLiteralValue: () => {
        if (++nodes > 200_000)
          throw new CliError('PAIRS_LIMIT', 'Pairs configuration exceeds its node budget.');
      },
      onObjectProperty: (name) => {
        const objectKeys = keys.at(-1);
        if (objectKeys?.has(name))
          throw new CliError(
            'PAIRS_DUPLICATE_PROPERTY',
            'Duplicate JSON property in pairs configuration: ' + JSON.stringify(name),
          );
        objectKeys?.add(name);
      },
      onError: (_error, offset) => {
        throw new CliError(
          'PAIRS_JSON',
          'Invalid strict JSON in pairs configuration at character ' + offset + '.',
        );
      },
    },
    { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false },
  );
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError('PAIRS_JSON', 'Pairs configuration is not valid JSON.');
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parsePairs(text: string): PairDefinition[] {
  const data = strictJson(text);
  if (
    !object(data) ||
    data.schemaVersion !== '1.0' ||
    !Array.isArray(data.pairs) ||
    Object.keys(data).some((key) => key !== 'schemaVersion' && key !== 'pairs')
  ) {
    throw new CliError(
      'PAIRS_SCHEMA',
      'Pairs configuration must contain only schemaVersion "1.0" and a pairs array.',
    );
  }
  if (data.pairs.length === 0 || data.pairs.length > MAX_BATCH_PAIRS)
    throw new CliError(
      'PAIRS_COUNT',
      'Provide between 1 and ' + MAX_BATCH_PAIRS + ' explicit pairs.',
    );
  const seen = new Set<string>();
  return data.pairs.map((entry: unknown, index: number) => {
    if (
      !object(entry) ||
      Object.keys(entry).some((key) => !['key', 'baseline', 'candidate'].includes(key)) ||
      typeof entry.key !== 'string' ||
      !entry.key.trim() ||
      entry.key.length > 200 ||
      typeof entry.baseline !== 'string' ||
      !entry.baseline ||
      typeof entry.candidate !== 'string' ||
      !entry.candidate
    ) {
      throw new CliError(
        'PAIR_SCHEMA',
        'Pair ' + (index + 1) + ' requires a nonempty key, baseline path and candidate path.',
      );
    }
    if (seen.has(entry.key))
      throw new CliError(
        'PAIR_KEY_DUPLICATE',
        'Pair keys must be unique: ' + JSON.stringify(entry.key),
      );
    seen.add(entry.key);
    return { key: entry.key, baseline: entry.baseline, candidate: entry.candidate };
  });
}

export function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof CliError || error instanceof AuditError)
    return { code: error.code, message: error.message };
  if (error instanceof Error) {
    const code =
      'code' in error && typeof error.code === 'string' ? error.code : 'UNEXPECTED_ERROR';
    return {
      code,
      message:
        'The operation could not complete (' +
        code +
        '). Check the selected files and directories. No successful result was produced.',
    };
  }
  return {
    code: 'UNEXPECTED_ERROR',
    message: 'The audit could not complete. No successful result was produced.',
  };
}

export interface BatchOptions {
  policy: AuditPolicy;
  baselineDir?: string;
  candidateDir?: string;
  generatedAt?: string;
  outputPath?: string;
  /** Constrained embeddings may lower, never raise, the built-in report budget. */
  reportByteLimit?: number;
}

export interface BatchRun {
  report: BatchReport;
  inputPaths: string[];
}

export async function runBatch(pairsPath: string, options: BatchOptions): Promise<BatchRun> {
  const definitions = parsePairs(await readTextFile(pairsPath, MAX_CONFIG_BYTES));
  const root = await realpath(dirname(resolve(pairsPath)));
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const inputPaths = [
    resolve(pairsPath),
    ...definitions.flatMap((definition) => [
      resolve(root, definition.baseline),
      resolve(root, definition.candidate),
    ]),
  ];
  const pairs: BatchPairResult[] = [];
  const issues: BatchIssue[] = [];
  const baselinePaths = new Set<string>();
  const candidatePaths = new Set<string>();
  const budget: ByteBudget = { used: 0, maximum: MAX_BATCH_BYTES };
  const reportByteLimit = Math.min(
    options.reportByteLimit ?? MAX_BATCH_REPORT_BYTES,
    MAX_BATCH_REPORT_BYTES,
  );
  if (!Number.isSafeInteger(reportByteLimit) || reportByteLimit < 1)
    throw new CliError('BATCH_REPORT_LIMIT', 'The report byte limit must be a positive integer.');
  let reportBytes = 0;
  let reportBudgetExhausted = false;
  const unreviewedPolicy: AuditPolicy = {
    schemaVersion: '1.0',
    uriRules: options.policy.uriRules,
    acceptedChanges: [],
  };
  for (const definition of definitions) {
    try {
      // Resolve both independently: even if one is missing, the other selected
      // file must remain protected from --output/--force and alias overwrites.
      const resolved = await Promise.allSettled([
        rootedPath(root, definition.baseline),
        rootedPath(root, definition.candidate),
      ]);
      for (const input of resolved) if (input.status === 'fulfilled') inputPaths.push(input.value);
      const beforeResult = resolved[0];
      const afterResult = resolved[1];
      if (beforeResult.status === 'rejected') throw beforeResult.reason;
      if (afterResult.status === 'rejected') throw afterResult.reason;
      const before = beforeResult.value;
      const after = afterResult.value;
      if (baselinePaths.has(before) || candidatePaths.has(after))
        throw new CliError(
          'PAIR_FILE_DUPLICATE',
          'A baseline or candidate file has been assigned to more than one pair.',
        );
      baselinePaths.add(before);
      candidatePaths.add(after);
      if (reportBudgetExhausted)
        throw new CliError(
          'BATCH_REPORT_LIMIT',
          'The aggregate audit-report budget is exhausted. Split the corpus into smaller batches.',
        );
      if (budget.used > budget.maximum)
        throw new CliError(
          'BATCH_TOO_LARGE',
          'The batch input budget is exhausted. Split the corpus into smaller batches.',
        );
      const baselineText = await readTextFile(before, MAX_INPUT_BYTES, budget);
      const candidateText = await readTextFile(after, MAX_INPUT_BYTES, budget);
      const report = await audit(
        { name: basename(definition.baseline), text: baselineText },
        { name: basename(definition.candidate), text: candidateText },
        { policy: unreviewedPolicy, generatedAt },
      );
      const bytes = Buffer.byteLength(JSON.stringify(report), 'utf8');
      if (reportBytes + bytes > reportByteLimit) {
        reportBudgetExhausted = true;
        throw new CliError(
          'BATCH_REPORT_LIMIT',
          'This pair would exceed the ' +
            reportByteLimit +
            '-byte aggregate audit-report limit. No partial audit for this pair was retained; split the corpus.',
        );
      }
      reportBytes += bytes;
      pairs.push({ ...definition, report, error: null });
    } catch (error) {
      pairs.push({ ...definition, report: null, error: describeError(error) });
    }
  }
  const allFindingIds = new Set(
    pairs.flatMap((pair) => pair.report?.findings.map((finding) => finding.id) ?? []),
  );
  for (const decision of options.policy.acceptedChanges) {
    if (!allFindingIds.has(decision.findingId))
      issues.push({
        code: 'STALE_APPROVAL',
        message: 'Saved approval does not match any current finding: ' + decision.findingId,
      });
  }
  let reviewedBytes = 0;
  let reviewedBudgetExhausted = false;
  for (const pair of pairs) {
    if (pair.report) {
      const ids = new Set(pair.report.findings.map((finding) => finding.id));
      const decisions = options.policy.acceptedChanges.filter((decision) =>
        ids.has(decision.findingId),
      );
      const reviewed = applyDecisions(pair.report, decisions);
      const bytes = Buffer.byteLength(JSON.stringify(reviewed), 'utf8');
      if (reviewedBudgetExhausted || reviewedBytes + bytes > reportByteLimit) {
        reviewedBudgetExhausted = true;
        pair.report = null;
        pair.error = {
          code: 'BATCH_REPORT_LIMIT',
          message:
            'Reviewed evidence would exceed the aggregate audit-report budget. No partial audit for this pair was retained; split the corpus.',
        };
      } else {
        reviewedBytes += bytes;
        pair.report = reviewed;
      }
    }
  }
  for (const side of ['baseline', 'candidate'] as const) {
    const directory = side === 'baseline' ? options.baselineDir : options.candidateDir;
    const assigned = side === 'baseline' ? baselinePaths : candidatePaths;
    if (directory) {
      let inventoryRoot: string;
      try {
        inventoryRoot = await realpath(resolve(directory));
      } catch {
        throw new CliError(
          'INVENTORY_DIRECTORY',
          'Cannot resolve the selected ' + side + ' inventory directory: ' + basename(directory),
        );
      }
      if (
        options.outputPath &&
        isWithin(inventoryRoot, await resolveOutputLocation(options.outputPath))
      )
        throw new CliError(
          'OUTPUT_IN_INVENTORY',
          'Choose an output path outside the inventory directories so reports cannot become future inputs.',
        );
      try {
        const found = await inventoryJson(inventoryRoot);
        for (const file of found)
          if (!assigned.has(file))
            issues.push({
              code: 'UNPAIRED_INPUT',
              message:
                side + ' inventory has an unpaired JSON file: ' + relative(inventoryRoot, file),
            });
        for (const file of assigned)
          if (!isWithin(inventoryRoot, file))
            issues.push({
              code: 'INPUT_OUTSIDE_INVENTORY',
              message: side + ' pair file is outside its declared inventory: ' + basename(file),
            });
      } catch (error) {
        issues.push(describeError(error));
      }
    }
  }
  const errors = pairs.filter((pair) => pair.error).length;
  const count = (status: string): number =>
    pairs.filter((pair) => pair.report?.status === status).length;
  const issueError = issues.some(
    (issue) =>
      !['STALE_APPROVAL', 'UNPAIRED_INPUT', 'INPUT_OUTSIDE_INVENTORY'].includes(issue.code),
  );
  const status: BatchReport['status'] =
    errors || issueError
      ? 'error'
      : issues.length || count('incomplete')
        ? 'incomplete'
        : count('fail')
          ? 'fail'
          : count('review')
            ? 'review'
            : 'pass';
  return {
    inputPaths,
    report: {
      schemaVersion: '1.0',
      kind: 'batch',
      toolVersion: TOOL_VERSION,
      generatedAt,
      status,
      summary: {
        requested: definitions.length,
        processed: pairs.length,
        passed: count('pass'),
        review: count('review'),
        failed: count('fail'),
        incomplete: count('incomplete'),
        errors,
        issues: issues.length,
      },
      pairs,
      issues,
    },
  };
}

async function inventoryJson(root: string): Promise<Set<string>> {
  const found = new Set<string>();
  const directories = [root];
  let count = 0;
  while (directories.length) {
    const directory = directories.pop();
    if (!directory) break;
    const handle = await opendir(directory);
    for await (const entry of handle) {
      if (++count > MAX_INVENTORY_ENTRIES)
        throw new CliError(
          'INVENTORY_LIMIT',
          'Inventory exceeds ' + MAX_INVENTORY_ENTRIES + ' entries. Split the corpus.',
        );
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new CliError(
          'INVENTORY_SYMLINK',
          'Inventory contains a symlink; remove it or select a directory without symlinks: ' +
            entry.name,
        );
      if (entry.isDirectory()) directories.push(path);
      else if (entry.isFile() && /\.json$/iu.test(entry.name)) found.add(await realpath(path));
    }
  }
  return found;
}
