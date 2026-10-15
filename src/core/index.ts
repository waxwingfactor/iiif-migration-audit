import { extract, type Entity, type Fact } from './extract';
import { AuditError, escapePointer, isObject, parseJson, sha256, stableStringify } from './parser';
import { emptyPolicy, mapUri, sortedRules, validateDecisions, validatePolicy } from './policy';
import type {
  AcceptedChange,
  AuditInput,
  AuditOptions,
  AuditReport,
  Category,
  CoverageNotice,
  Finding,
  JsonValue,
  Severity,
  SourceRef,
  UriRule,
  UriScope,
} from './types';

export * from './types';
export { AuditError, MAX_INPUT_BYTES, MAX_DEPTH, MAX_NODES, MAX_CANVASES } from './parser';
export { emptyPolicy, parsePolicy } from './policy';
export const TOOL_VERSION = '0.1.0';
export const PROFILE_VERSION = 'static-image-1' as const;
export const FINGERPRINT_VERSION = '1' as const;

interface PendingFinding extends Omit<Finding, 'id' | 'accepted'> {}

function nestedScope(key: string, scope: UriScope): UriScope {
  if (key === 'services') return 'image-service';
  if (key === 'targets') return 'canvas';
  if (['bodies', 'logo', 'thumbnail'].includes(key)) return 'image';
  if (['homepage', 'seeAlso'].includes(key)) return 'link';
  return scope;
}

function visitUris(
  value: JsonValue,
  scope: UriScope,
  visit: (id: string, role: UriScope) => void,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) visitUris(entry, scope, visit);
    return;
  }
  if (!isObject(value)) return;
  const ownScope =
    scope === 'range' && value.type === 'Canvas'
      ? 'canvas'
      : value.bodies !== undefined
        ? 'link'
        : scope;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'id' && typeof entry === 'string') visit(entry, ownScope);
    else visitUris(entry, nestedScope(key, scope), visit);
  }
}

/** Retention ignores array order only for classifying an already detected change. */
function retains(before: JsonValue, after: JsonValue, budget = { remaining: 200_000 }): boolean {
  if (--budget.remaining < 0)
    throw new AuditError(
      'COMPARISON_BUDGET',
      'Complex value matching exceeded the comparison budget. Reduce this manifest or review the changed structure separately.',
    );
  if (Array.isArray(before) && Array.isArray(after)) {
    const positions = new Map<string, number[]>();
    after.forEach((value, index) => {
      const key = stableStringify(value);
      const bucket = positions.get(key) ?? [];
      bucket.push(index);
      positions.set(key, bucket);
    });
    const used = new Set<number>();
    const unmatched: JsonValue[] = [];
    for (const value of before) {
      const index = positions.get(stableStringify(value))?.pop();
      if (index === undefined) unmatched.push(value);
      else used.add(index);
    }
    const remaining = after.filter((_, index) => !used.has(index));
    return unmatched.every((value) => {
      const index = remaining.findIndex((other) => retains(value, other, budget));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
  }
  if (isObject(before) && isObject(after))
    return Object.keys(before).every(
      (key) => after[key] !== undefined && retains(before[key]!, after[key]!, budget),
    );
  return stableStringify(before) === stableStringify(after);
}

function rewrite(value: JsonValue, scope: UriScope | undefined, rules: UriRule[]): JsonValue {
  if (!scope) return value;
  if (Array.isArray(value)) return value.map((entry) => rewrite(entry, scope, rules));
  if (!isObject(value)) return value;
  const ownScope: UriScope =
    scope === 'range' && value.type === 'Canvas'
      ? 'canvas'
      : value.bodies !== undefined
        ? 'link'
        : scope;
  const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'id' && typeof entry === 'string') result[key] = mapUri(entry, ownScope, rules);
    else result[key] = rewrite(entry, nestedScope(key, scope), rules);
  }
  return result;
}

function summarize(report: AuditReport): AuditReport {
  const findings = report.findings.filter((finding) => !finding.accepted);
  report.summary.errors = findings.filter((finding) => finding.severity === 'error').length;
  report.summary.warnings = findings.filter((finding) => finding.severity === 'warning').length;
  report.summary.info = findings.filter((finding) => finding.severity === 'info').length;
  report.summary.accepted = report.findings.length - findings.length;
  report.summary.incomplete = report.coverage.length;
  report.status = report.coverage.length
    ? 'incomplete'
    : report.summary.errors
      ? 'fail'
      : report.summary.warnings
        ? 'review'
        : 'pass';
  return report;
}

/** Decisions are immutable review records; incomplete coverage cannot be accepted away. */
export function applyDecisions(report: AuditReport, changes: AcceptedChange[]): AuditReport {
  const decisions = validateDecisions(changes);
  const result = structuredClone(report);
  result.coverage = result.coverage.filter((notice) => notice.code !== 'STALE_DECISION');
  const byId = new Map(decisions.map((entry) => [entry.findingId, entry.reason]));
  const ids = new Set(result.findings.map((finding) => finding.id));
  for (const finding of result.findings) {
    const reason = byId.get(finding.id);
    finding.accepted = reason ? { reason } : null;
  }
  for (const [index, decision] of decisions.entries())
    if (!ids.has(decision.findingId))
      result.coverage.push({
        side: 'baseline',
        pointer: `/policy/acceptedChanges/${index}`,
        code: 'STALE_DECISION',
        message:
          'An approved change does not match these exact snapshots and URI policy. Recheck and remove the stale decision.',
      });
  result.policy.acceptedChanges = decisions;
  return summarize(result);
}

export async function audit(
  baselineInput: AuditInput,
  candidateInput: AuditInput,
  options: AuditOptions = {},
): Promise<AuditReport> {
  if (
    !baselineInput ||
    !candidateInput ||
    typeof baselineInput.name !== 'string' ||
    typeof candidateInput.name !== 'string'
  )
    throw new AuditError('INVALID_INPUT', 'Both inputs need a name and JSON text.');
  const policy = validatePolicy(options.policy ?? emptyPolicy());
  const baselineDocument = parseJson(baselineInput.text);
  const candidateDocument = parseJson(candidateInput.text);
  const baseline = extract(baselineDocument, 'baseline');
  const candidate = extract(candidateDocument, 'candidate');
  const [baselineHash, candidateHash] = await Promise.all([
    sha256(baselineInput.text),
    sha256(candidateInput.text),
  ]);
  const coverage: CoverageNotice[] = [...baseline.coverage, ...candidate.coverage];
  const pending: PendingFinding[] = [];
  let evidenceBytes = 0;
  const emit = (
    code: string,
    severity: Severity,
    category: Category,
    message: string,
    path: string,
    before: JsonValue,
    after: JsonValue,
    bp: string | null,
    cp: string | null,
  ): void => {
    evidenceBytes +=
      new TextEncoder().encode(stableStringify(before)).byteLength +
      new TextEncoder().encode(stableStringify(after)).byteLength;
    if (pending.length >= 25_000 || evidenceBytes > 64 * 1024 * 1024)
      throw new AuditError(
        'REPORT_BUDGET',
        'Generated evidence exceeds the 25,000-finding or 64 MiB report budget. Split the audit into smaller documents.',
      );
    pending.push({
      code,
      severity,
      category,
      message,
      path,
      before,
      after,
      pointers: { baseline: bp, candidate: cp },
    });
  };
  const compareFacts = (
    before: Map<string, Fact>,
    after: Map<string, Fact>,
    base: string,
  ): void => {
    const names = [...new Set([...before.keys(), ...after.keys()])].sort();
    for (const name of names) {
      const bf = before.get(name);
      const cf = after.get(name);
      const path = `${base}/${escapePointer(name)}`;
      if (!bf && cf) {
        emit(
          'FIELD_ADDED',
          ['navigation', 'rights'].includes(cf.category) ? 'warning' : 'info',
          cf.category,
          `Added ${name}${['navigation', 'rights'].includes(cf.category) ? '; review the change to navigation defaults or rights assertions' : ''}.`,
          path,
          null,
          cf.value,
          null,
          cf.pointer,
        );
        continue;
      }
      if (bf && !cf) {
        emit(
          'FIELD_REMOVED',
          name === 'legacySequenceLabel' ? 'warning' : 'error',
          bf.category,
          `Removed ${name} from the source.`,
          path,
          bf.value,
          null,
          bf.pointer,
          null,
        );
        continue;
      }
      if (!bf || !cf) continue;
      const mapped = rewrite(bf.value, bf.scope, policy.uriRules);
      if (stableStringify(mapped) === stableStringify(cf.value)) {
        if (stableStringify(bf.value) !== stableStringify(cf.value))
          emit(
            'URI_MAPPING_APPLIED',
            'info',
            bf.category,
            `Explicit URI rule accounts for changed ${name}; referenced bytes and network behavior were not inspected.`,
            path,
            bf.value,
            cf.value,
            bf.pointer,
            cf.pointer,
          );
        continue;
      }
      const retained = retains(mapped, cf.value);
      const reordered = retained && retains(cf.value, mapped);
      const critical =
        bf.category === 'rights' ||
        bf.category === 'navigation' ||
        name === 'paintings' ||
        name === 'width' ||
        name === 'height';
      const severity: Severity = critical
        ? 'error'
        : !retained
          ? 'error'
          : reordered
            ? 'warning'
            : 'info';
      emit(
        reordered ? 'ORDER_CHANGED' : !retained ? 'CONTENT_CHANGED' : 'CONTENT_ADDED',
        severity,
        bf.category,
        reordered
          ? `Order changed in ${name}.`
          : !retained
            ? `Source values in ${name} were removed or changed.`
            : `Added values to ${name}.`,
        path,
        bf.value,
        cf.value,
        bf.pointer,
        cf.pointer,
      );
    }
  };
  const mappedReferences = new Map<
    string,
    { originals: Set<string>; pointer: string; target: string; scope: UriScope }
  >();
  for (const facts of [
    baseline.facts,
    ...baseline.canvases.map((entity) => entity.facts),
    ...baseline.ranges.map((entity) => entity.facts),
  ]) {
    for (const fact of facts.values())
      if (fact.scope)
        visitUris(fact.value, fact.scope, (uri, scope) => {
          if (!['image', 'image-service', 'link'].includes(scope)) return;
          const target = mapUri(uri, scope, policy.uriRules);
          const key = `${scope}:${target}`;
          const entry = mappedReferences.get(key) ?? {
            originals: new Set<string>(),
            pointer: fact.pointer,
            target,
            scope,
          };
          entry.originals.add(uri);
          mappedReferences.set(key, entry);
        });
  }
  for (const entry of mappedReferences.values())
    if (entry.originals.size > 1) {
      coverage.push({
        side: 'baseline',
        pointer: entry.pointer,
        code: 'URI_IDENTITY_COLLISION',
        message: `URI rules collapse distinct ${entry.scope} references into one identity; inspect the mapping.`,
      });
      emit(
        'URI_IDENTITY_COLLISION',
        'error',
        'identity',
        `Distinct ${entry.scope} references collapse under the configured URI rules.`,
        `/uri-mappings/${entry.scope}/${escapePointer(entry.target)}`,
        [...entry.originals].sort(),
        entry.target,
        entry.pointer,
        null,
      );
    }
  if (baseline.id !== candidate.id) {
    const mapped = baseline.id ? mapUri(baseline.id, 'manifest', policy.uriRules) : null;
    emit(
      'MANIFEST_ID_CHANGED',
      mapped === candidate.id ? 'warning' : 'error',
      'identity',
      'Manifest identifier changed. Review external references even when a URI rule accounts for it.',
      '/manifest/id',
      baseline.id,
      candidate.id,
      baselineDocument.id !== undefined ? '/id' : '/@id',
      candidateDocument.id !== undefined ? '/id' : '/@id',
    );
  }
  compareFacts(baseline.facts, candidate.facts, '/manifest');
  const canvasPairs: AuditReport['canvasPairs'] = [];
  let removedCanvases = 0;
  let addedCanvases = 0;
  const matchEntities = (before: Entity[], after: Entity[], scope: 'canvas' | 'range'): void => {
    const mappedIds = new Map<string, Entity[]>();
    for (const entity of before) {
      const id = mapUri(entity.id, scope, policy.uriRules);
      const current = mappedIds.get(id) ?? [];
      current.push(entity);
      mappedIds.set(id, current);
    }
    const candidateIds = new Map<string, Entity[]>();
    for (const entity of after) {
      const current = candidateIds.get(entity.id) ?? [];
      current.push(entity);
      candidateIds.set(entity.id, current);
    }
    for (const [id, entities] of mappedIds)
      if (entities.length > 1) {
        coverage.push({
          side: 'baseline',
          pointer: entities[0]?.pointer ?? '',
          code: 'IDENTITY_COLLISION',
          message: `Multiple source ${scope} identities map to ${id}; no match was guessed.`,
        });
        emit(
          'IDENTITY_COLLISION',
          'error',
          'identity',
          `URI rules or duplicate identifiers collapse multiple ${scope} identities.`,
          `/${scope}s/${escapePointer(id)}`,
          entities.map((entity) => entity.id),
          id,
          entities[0]?.pointer ?? null,
          null,
        );
      }
    const matched = new Set<Entity>();
    const order: number[] = [];
    const beforeIndices = new Map(before.map((entity, index) => [entity, index]));
    const afterIndices = new Map(after.map((entity, index) => [entity, index]));
    for (const entity of before) {
      const mappedId = mapUri(entity.id, scope, policy.uriRules);
      const matches = candidateIds.get(mappedId);
      const counterpart =
        matches?.length === 1 && mappedIds.get(mappedId)?.length === 1 ? matches[0] : undefined;
      const path = `/${scope}s/${escapePointer(entity.id)}`;
      if (!counterpart) {
        emit(
          scope === 'canvas' ? 'CANVAS_REMOVED' : 'RANGE_REMOVED',
          'error',
          scope === 'canvas' ? 'pages' : 'navigation',
          `Source ${scope} was not matched. No positional or label-based match was assumed.`,
          path,
          entity.id,
          null,
          entity.pointer,
          null,
        );
        if (scope === 'canvas') removedCanvases++;
        continue;
      }
      matched.add(counterpart);
      const beforeIndex = beforeIndices.get(entity)!;
      const afterIndex = afterIndices.get(counterpart)!;
      order.push(afterIndex);
      if (scope === 'canvas')
        canvasPairs.push({
          baselineId: entity.id,
          candidateId: counterpart.id,
          baselineIndex: beforeIndex,
          candidateIndex: afterIndex,
          label: entity.label || counterpart.label,
          matchedBy: entity.id === counterpart.id ? 'id' : 'uri-rule',
        });
      if (entity.id !== counterpart.id)
        emit(
          scope === 'canvas' ? 'CANVAS_ID_CHANGED' : 'RANGE_ID_CHANGED',
          'warning',
          'identity',
          `Explicit mapping matched a changed ${scope} identifier. External annotations or references may still break.`,
          `${path}/id`,
          entity.id,
          counterpart.id,
          entity.idPointer,
          counterpart.idPointer,
        );
      compareFacts(entity.facts, counterpart.facts, path);
    }
    for (const entity of after)
      if (!matched.has(entity)) {
        emit(
          scope === 'canvas' ? 'CANVAS_ADDED' : 'RANGE_ADDED',
          'info',
          scope === 'canvas' ? 'pages' : 'navigation',
          `Candidate ${scope} was added or has an unmatched identity.`,
          `/${scope}s/${escapePointer(entity.id)}`,
          null,
          entity.id,
          null,
          entity.pointer,
        );
        if (scope === 'canvas') addedCanvases++;
      }
    if (scope === 'canvas' && order.some((index, i) => i > 0 && index < order[i - 1]!))
      emit(
        'CANVAS_ORDER_CHANGED',
        'error',
        'pages',
        'Matched pages occur in a different reading order.',
        '/canvases/order',
        before.map((entity) => entity.id),
        after.map((entity) => entity.id),
        baseline.version === '2.1' ? '/sequences/0/canvases' : '/items',
        candidate.version === '2.1' ? '/sequences/0/canvases' : '/items',
      );
  };
  matchEntities(baseline.canvases, candidate.canvases, 'canvas');
  matchEntities(baseline.ranges, candidate.ranges, 'range');
  const fingerprintContext = {
    toolVersion: TOOL_VERSION,
    baselineHash,
    candidateHash,
    uriRules: sortedRules(policy.uriRules),
    profile: PROFILE_VERSION,
    fingerprint: FINGERPRINT_VERSION,
  };
  pending.sort((a, b) => {
    const x = `${a.path}:${a.code}`;
    const y = `${b.path}:${b.code}`;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const findings = await Promise.all(
    pending.map(async (finding): Promise<Finding> => ({
      ...finding,
      id: await sha256(
        stableStringify({
          context: fingerprintContext,
          code: finding.code,
          path: finding.path,
          before: finding.before,
          after: finding.after,
        }),
      ),
      accepted: null,
    })),
  );
  const source = (input: AuditInput, snapshot: typeof baseline, hash: string): SourceRef => ({
    name: input.name,
    sha256: hash,
    version: snapshot.version,
    id: snapshot.id,
    label: snapshot.label,
    canvasCount: snapshot.canvases.length,
  });
  const report: AuditReport = {
    schemaVersion: '1.0',
    toolVersion: TOOL_VERSION,
    profileVersion: PROFILE_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    baseline: source(baselineInput, baseline, baselineHash),
    candidate: source(candidateInput, candidate, candidateHash),
    policy,
    status: 'pass',
    summary: {
      errors: 0,
      warnings: 0,
      info: 0,
      accepted: 0,
      incomplete: 0,
      matchedCanvases: canvasPairs.length,
      removedCanvases,
      addedCanvases,
    },
    findings,
    canvasPairs,
    coverage,
  };
  return applyDecisions(report, policy.acceptedChanges);
}
