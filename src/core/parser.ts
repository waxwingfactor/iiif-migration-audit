import {
  getLocation,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from 'jsonc-parser';
import type { JsonObject, JsonValue } from './types';

export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_DEPTH = 64;
export const MAX_NODES = 300_000;
export const MAX_CANVASES = 20_000;

export class AuditError extends Error {
  readonly code: string;
  readonly pointer: string | null;
  constructor(code: string, message: string, pointer: string | null = null) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.pointer = pointer;
  }
}

export const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const escapePointer = (key: string): string =>
  key.replaceAll('~', '~0').replaceAll('/', '~1');

/** Reject pathological depth before invoking a recursive third-party parser. */
function checkLexicalDepth(text: string): void {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > MAX_DEPTH) {
        throw new AuditError('INPUT_DEPTH', `JSON nesting exceeds the ${MAX_DEPTH}-level limit.`);
      }
    } else if (character === '}' || character === ']') depth--;
  }
}

/** Compare decimal meaning rather than lexical spelling (1e3 equals 1000). */
function canonicalDecimal(token: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return 'invalid';
  const fraction = match[3] ?? '';
  let digits = (match[2]! + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const exponent = Number(match[4] ?? '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100_000) return 'unrepresentable';
  const trailing = /0+$/.exec(digits)?.[0].length ?? 0;
  digits = digits.slice(0, digits.length - trailing);
  return `${match[1]}${digits}e${exponent - fraction.length + trailing}`;
}

export function parseJson(text: string): JsonObject {
  if (typeof text !== 'string') throw new AuditError('INPUT_TYPE', 'Input must be JSON text.');
  if (new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES) {
    throw new AuditError(
      'INPUT_SIZE',
      'Input exceeds the 20 MiB limit. Split the corpus into manifests.',
    );
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  checkLexicalDepth(text);
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true });
  if (!tree || errors.length) {
    const error = errors[0];
    const location = getLocation(text, error?.offset ?? 0);
    throw new AuditError(
      'INVALID_JSON',
      error
        ? `Invalid JSON: ${printParseErrorCode(error.error)} at character ${error.offset + 1}.`
        : 'Input is empty.',
      '/' + location.path.map((part) => escapePointer(String(part))).join('/'),
    );
  }
  const pending: { node: Node; path: string }[] = [{ node: tree, path: '' }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++count > MAX_NODES)
      throw new AuditError('INPUT_NODES', `JSON exceeds the ${MAX_NODES}-node limit.`);
    if (current.node.type === 'number') {
      const value = current.node.value as number;
      const token = text.slice(current.node.offset, current.node.offset + current.node.length);
      if (
        !Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
        canonicalDecimal(token) !== canonicalDecimal(String(value))
      ) {
        throw new AuditError(
          'INPUT_NUMBER_PRECISION',
          'A number cannot be represented reliably. Use safe integer dimensions and lossless JSON numbers.',
          current.path,
        );
      }
    }
    if (current.node.type === 'object') {
      const keys = new Set<string>();
      for (const property of current.node.children ?? []) {
        const key = String(property.children?.[0]?.value);
        const pointer = `${current.path}/${escapePointer(key)}`;
        if (keys.has(key))
          throw new AuditError('DUPLICATE_KEY', `Duplicate JSON property: ${key}.`, pointer);
        keys.add(key);
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
          throw new AuditError(
            'UNSAFE_KEY',
            `Reserved object property ${key} is not accepted.`,
            pointer,
          );
        }
        const child = property.children?.[1];
        if (child) pending.push({ node: child, path: pointer });
      }
    } else if (current.node.type === 'array') {
      for (const [index, node] of (current.node.children ?? []).entries()) {
        pending.push({ node, path: `${current.path}/${index}` });
      }
    }
  }
  const value: unknown = JSON.parse(text);
  if (!isObject(value))
    throw new AuditError('INPUT_ROOT', 'Expected a JSON object at the document root.', '');
  return value;
}

export function stableStringify(value: JsonValue | unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function sha256(text: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
