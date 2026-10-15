import { basename, resolve } from 'node:path';
import { audit, emptyPolicy, MAX_INPUT_BYTES, parsePolicy, TOOL_VERSION } from '../core/index';
import type { AuditPolicy, AuditReport } from '../core/types';
import { renderCsv, renderHtml, renderJson } from '../report/index';
import { describeError, MAX_CONFIG_BYTES, runBatch } from './batch';
import { CliError, readTextFile, writeOutput } from './io';
import { renderBatchCsv, renderBatchHtml, renderBatchJson } from './render';
import { fetchSnapshot } from './snapshot';
import { EXIT_CODES } from './types';

const HELP = `IIIF Migration Audit

Compare saved Presentation 2.1 / 3.0 still-image manifests locally.

Usage:
  iiif-audit compare BEFORE.json AFTER.json [options]
  iiif-audit batch PAIRS.json [options]
  iiif-audit snapshot URL --output FILE.json [--presentation 2|3] [--force]

Compare and batch options:
  --policy FILE           Explicit URI rules and reasoned saved decisions
  --format json|html|csv  Output format (default: json)
  --output FILE          Save output; otherwise write only the report to stdout
  --force                Replace an existing output, never a selected input

Batch-only options:
  --baseline-dir DIR     Check a baseline inventory for unpaired JSON files
  --candidate-dir DIR    Check a candidate inventory for unpaired JSON files

Snapshot-only options:
  --presentation 2|3     Requested Presentation context (default: 3)

Other options:
  --help, -h             Show this help
  --version              Show the installed version

Exit codes: 0 pass; 1 needs review; 2 preservation failure;
            3 incomplete; 4 input, configuration, I/O or execution error.

Comparison never fetches URLs. Only snapshot performs an explicit HTTP(S)
request; it does not fetch linked content or verify IIIF conformance.
Reports may contain unpublished metadata. Export and share deliberately.
`;

type Format = 'json' | 'html' | 'csv';
interface Arguments {
  command: string;
  positionals: string[];
  flags: Map<string, string | true>;
}
export interface CliContext {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  fetch?: typeof fetch;
}

function parseArguments(args: readonly string[]): Arguments {
  const command = args[0] ?? '';
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  let positionalOnly = false;
  for (let index = 1; index < args.length; index++) {
    const token = args[index];
    if (!token) continue;
    if (token === '--' && !positionalOnly) {
      positionalOnly = true;
      continue;
    }
    if (token === '-h' && !positionalOnly) {
      if (flags.has('help'))
        throw new CliError('ARGUMENT_DUPLICATE', 'Help was requested more than once.');
      flags.set('help', true);
      continue;
    }
    if (!token.startsWith('--') || positionalOnly) {
      positionals.push(token);
      continue;
    }
    const equal = token.indexOf('=');
    const key = equal === -1 ? token.slice(2) : token.slice(2, equal);
    if (flags.has(key))
      throw new CliError('ARGUMENT_DUPLICATE', 'Option --' + key + ' was provided more than once.');
    if (key === 'force' || key === 'help') {
      if (equal !== -1)
        throw new CliError('ARGUMENT_VALUE', '--' + key + ' does not take a value.');
      flags.set(key, true);
    } else {
      const value = equal === -1 ? args[++index] : token.slice(equal + 1);
      if (!value || value.startsWith('--'))
        throw new CliError('ARGUMENT_VALUE', 'Option --' + key + ' requires a value.');
      flags.set(key, value);
    }
  }
  return { command, positionals, flags };
}

function option(args: Arguments, key: string): string | undefined {
  const value = args.flags.get(key);
  return typeof value === 'string' ? value : undefined;
}

function validateArguments(args: Arguments): void {
  const allowed: Record<string, string[]> = {
    compare: ['policy', 'format', 'output', 'force'],
    batch: ['policy', 'format', 'output', 'force', 'baseline-dir', 'candidate-dir'],
    snapshot: ['output', 'presentation', 'force'],
  };
  const options = Object.hasOwn(allowed, args.command) ? allowed[args.command] : undefined;
  if (!options)
    throw new CliError(
      'ARGUMENT_COMMAND',
      'Choose compare, batch or snapshot. Use --help for examples.',
    );
  for (const key of args.flags.keys())
    if (!options.includes(key))
      throw new CliError('ARGUMENT_UNKNOWN', 'Unknown option for ' + args.command + ': --' + key);
  const wanted = args.command === 'compare' ? 2 : 1;
  if (args.positionals.length !== wanted)
    throw new CliError(
      'ARGUMENT_POSITIONAL',
      args.command +
        ' requires ' +
        wanted +
        ' positional argument' +
        (wanted === 1 ? '' : 's') +
        '. Use --help for usage.',
    );
  if (
    args.command !== 'snapshot' &&
    option(args, 'format') &&
    !['json', 'html', 'csv'].includes(option(args, 'format') ?? '')
  )
    throw new CliError('ARGUMENT_FORMAT', '--format must be json, html or csv.');
  if (args.command === 'snapshot' && !option(args, 'output'))
    throw new CliError(
      'ARGUMENT_OUTPUT',
      'snapshot requires --output FILE.json so the exact response is saved.',
    );
  if (
    args.command === 'snapshot' &&
    option(args, 'presentation') &&
    !['2', '3'].includes(option(args, 'presentation') ?? '')
  )
    throw new CliError('ARGUMENT_PRESENTATION', '--presentation must be 2 or 3.');
}

async function loadPolicy(path: string | undefined): Promise<AuditPolicy> {
  return path ? parsePolicy(await readTextFile(path, MAX_CONFIG_BYTES)) : emptyPolicy();
}

export async function runCli(argv: readonly string[], context: CliContext = {}): Promise<number> {
  const stdout = context.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = context.stderr ?? ((text: string) => process.stderr.write(text));
  const cwd = context.cwd ?? process.cwd();
  if (!argv.length || (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h'))) {
    stdout(HELP);
    return 0;
  }
  if (argv.length === 1 && argv[0] === '--version') {
    stdout(TOOL_VERSION + '\n');
    return 0;
  }
  try {
    const args = parseArguments(argv);
    if (args.flags.get('help')) {
      stdout(HELP);
      return 0;
    }
    validateArguments(args);
    const path = (value: string): string => resolve(cwd, value);
    const policyPath = option(args, 'policy');
    const output = option(args, 'output');
    const force = args.flags.get('force') === true;
    const format = (option(args, 'format') ?? 'json') as Format;
    const emit = async (content: string, inputs: string[]): Promise<void> => {
      if (output) await writeOutput(path(output), content, inputs, force);
      else stdout(content);
    };
    if (args.command === 'snapshot') {
      const url = args.positionals[0];
      if (!url || !output)
        throw new CliError('ARGUMENT_OUTPUT', 'snapshot requires a URL and --output.');
      const presentation = (option(args, 'presentation') ?? '3') as '2' | '3';
      const snapshot = await fetchSnapshot(url, {
        presentation,
        maximumBytes: MAX_INPUT_BYTES,
        ...(context.fetch ? { fetch: context.fetch } : {}),
      });
      await writeOutput(path(output), snapshot.text, [], force);
      stderr(
        'Saved ' +
          snapshot.bytes +
          ' bytes to ' +
          basename(output) +
          '. Requested Presentation ' +
          presentation +
          '; actual resource version is checked during comparison.\n',
      );
      return 0;
    }
    const policy = await loadPolicy(policyPath ? path(policyPath) : undefined);
    if (args.command === 'compare') {
      const before = args.positionals[0];
      const after = args.positionals[1];
      if (!before || !after)
        throw new CliError('ARGUMENT_POSITIONAL', 'compare requires baseline and candidate files.');
      const baselinePath = path(before);
      const candidatePath = path(after);
      const baselineText = await readTextFile(baselinePath, MAX_INPUT_BYTES);
      const candidateText = await readTextFile(candidatePath, MAX_INPUT_BYTES);
      const report = await audit(
        { name: basename(before), text: baselineText },
        { name: basename(after), text: candidateText },
        { policy },
      );
      const content =
        format === 'html'
          ? renderHtml(report)
          : format === 'csv'
            ? renderCsv(report)
            : renderJson(report);
      await emit(content, [baselinePath, candidatePath, ...(policyPath ? [path(policyPath)] : [])]);
      stderr(
        report.status +
          ': ' +
          report.summary.errors +
          ' errors, ' +
          report.summary.warnings +
          ' warnings, ' +
          report.summary.accepted +
          ' accepted, ' +
          report.summary.incomplete +
          ' incomplete.\n',
      );
      return exitForReport(report);
    }
    const pairs = args.positionals[0];
    if (!pairs) throw new CliError('ARGUMENT_POSITIONAL', 'batch requires a pairs file.');
    const baselineDir = option(args, 'baseline-dir');
    const candidateDir = option(args, 'candidate-dir');
    const batch = await runBatch(path(pairs), {
      policy,
      ...(baselineDir ? { baselineDir: path(baselineDir) } : {}),
      ...(candidateDir ? { candidateDir: path(candidateDir) } : {}),
      ...(output ? { outputPath: path(output) } : {}),
    });
    const content =
      format === 'html'
        ? renderBatchHtml(batch.report)
        : format === 'csv'
          ? renderBatchCsv(batch.report)
          : renderBatchJson(batch.report);
    await emit(content, [...batch.inputPaths, ...(policyPath ? [path(policyPath)] : [])]);
    stderr(
      batch.report.status +
        ': ' +
        batch.report.summary.processed +
        '/' +
        batch.report.summary.requested +
        ' pairs processed, ' +
        batch.report.summary.errors +
        ' errors, ' +
        batch.report.summary.issues +
        ' corpus issues.\n',
    );
    return EXIT_CODES[batch.report.status];
  } catch (error) {
    const detail = describeError(error);
    stderr(detail.code + ': ' + detail.message + '\n');
    return 4;
  }
}

export function exitForReport(report: AuditReport): number {
  return EXIT_CODES[report.status];
}
