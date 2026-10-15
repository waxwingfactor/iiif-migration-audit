import { AuditError, isObject, parseJson, stableStringify } from './parser';
import type { AcceptedChange, AuditPolicy, JsonValue, UriRule, UriScope } from './types';

const scopes: UriScope[] = ['manifest', 'canvas', 'range', 'image', 'image-service', 'link'];
export const emptyPolicy = (): AuditPolicy => ({
  schemaVersion: '1.0',
  uriRules: [],
  acceptedChanges: [],
});

export function validateDecisions(value: unknown): AcceptedChange[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new AuditError(
      'INVALID_POLICY',
      'acceptedChanges must be an array of at most 10,000 decisions.',
    );
  }
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    if (
      !isObject(entry) ||
      Object.keys(entry).some((key) => !['findingId', 'reason'].includes(key)) ||
      typeof entry.findingId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.findingId) ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim() ||
      entry.reason.length > 2_000
    ) {
      throw new AuditError(
        'INVALID_POLICY',
        'Each decision needs a SHA-256 findingId and a reason of 1–2,000 characters.',
      );
    }
    if (seen.has(entry.findingId))
      throw new AuditError('DUPLICATE_DECISION', 'A finding has multiple decisions.');
    seen.add(entry.findingId);
    return { findingId: entry.findingId, reason: entry.reason.trim() };
  });
}

export function validatePolicy(value: unknown): AuditPolicy {
  if (
    !isObject(value) ||
    value.schemaVersion !== '1.0' ||
    Object.keys(value).some(
      (key) => !['schemaVersion', 'uriRules', 'acceptedChanges'].includes(key),
    ) ||
    !Array.isArray(value.uriRules) ||
    value.uriRules.length > 1_000
  ) {
    throw new AuditError(
      'INVALID_POLICY',
      'Expected policy schemaVersion 1.0, uriRules, and acceptedChanges.',
    );
  }
  const seen = new Set<string>();
  const uriRules = value.uriRules.map((entry: JsonValue): UriRule => {
    if (
      !isObject(entry) ||
      Object.keys(entry).some((key) => !['scope', 'fromPrefix', 'toPrefix'].includes(key)) ||
      !scopes.includes(entry.scope as UriScope) ||
      typeof entry.fromPrefix !== 'string' ||
      typeof entry.toPrefix !== 'string'
    ) {
      throw new AuditError(
        'INVALID_URI_RULE',
        'Each URI rule needs a supported scope, fromPrefix and toPrefix.',
      );
    }
    for (const prefix of [entry.fromPrefix, entry.toPrefix]) {
      try {
        const uri = new URL(prefix);
        if (
          !['http:', 'https:'].includes(uri.protocol) ||
          uri.username ||
          uri.password ||
          uri.search ||
          uri.hash ||
          (uri.href !== prefix && uri.href !== prefix + '/')
        )
          throw new Error('prefix');
      } catch {
        throw new AuditError(
          'INVALID_URI_RULE',
          'URI prefixes must be canonical HTTP(S) host or path URLs without credentials, query, or fragment.',
        );
      }
    }
    if (entry.fromPrefix === entry.toPrefix)
      throw new AuditError('INVALID_URI_RULE', 'A URI rule must change its prefix.');
    const key = `${entry.scope}:${entry.fromPrefix}`;
    if (seen.has(key))
      throw new AuditError(
        'CONFLICTING_URI_RULE',
        'Duplicate or conflicting URI prefixes in the same scope.',
      );
    seen.add(key);
    return {
      scope: entry.scope as UriScope,
      fromPrefix: entry.fromPrefix,
      toPrefix: entry.toPrefix,
    };
  });
  return {
    schemaVersion: '1.0',
    uriRules,
    acceptedChanges: validateDecisions(value.acceptedChanges),
  };
}

export const parsePolicy = (text: string): AuditPolicy => validatePolicy(parseJson(text));
export const sortedRules = (rules: UriRule[]): UriRule[] =>
  [...rules].sort((a, b) =>
    stableStringify(a) < stableStringify(b) ? -1 : stableStringify(a) > stableStringify(b) ? 1 : 0,
  );

export function mapUri(uri: string, scope: UriScope, rules: UriRule[]): string {
  const rule = rules
    .filter(
      (entry) =>
        entry.scope === scope &&
        uri.startsWith(entry.fromPrefix) &&
        (entry.fromPrefix.endsWith('/') ||
          uri.length === entry.fromPrefix.length ||
          '/?#'.includes(uri[entry.fromPrefix.length]!)),
    )
    .sort((a, b) => b.fromPrefix.length - a.fromPrefix.length)[0];
  return rule ? rule.toPrefix + uri.slice(rule.fromPrefix.length) : uri;
}
