/** Stable serializable contract shared by the CLI, browser worker, and reports. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type PresentationVersion = '2.1' | '3.0';
export type Severity = 'error' | 'warning' | 'info';
export type Category =
  'identity' | 'pages' | 'description' | 'rights' | 'navigation' | 'content' | 'coverage';
export type UriScope = 'manifest' | 'canvas' | 'range' | 'image' | 'image-service' | 'link';

export interface UriRule {
  scope: UriScope;
  fromPrefix: string;
  toPrefix: string;
}

export interface AcceptedChange {
  /** SHA-256 binds both input hashes, URI rules, profile/fingerprint version, and finding evidence. */
  findingId: string;
  reason: string;
}

export interface AuditPolicy {
  schemaVersion: '1.0';
  uriRules: UriRule[];
  acceptedChanges: AcceptedChange[];
}

export interface SourceRef {
  name: string;
  sha256: string;
  version: PresentationVersion | 'unsupported';
  id: string | null;
  label: string;
  canvasCount: number;
}

export interface Finding {
  id: string;
  code: string;
  severity: Severity;
  category: Category;
  message: string;
  /** Stable logical path, separate from version-specific source JSON pointers. */
  path: string;
  before: JsonValue;
  after: JsonValue;
  pointers: { baseline: string | null; candidate: string | null };
  accepted: { reason: string } | null;
}

export interface CanvasPair {
  baselineId: string;
  candidateId: string;
  baselineIndex: number;
  candidateIndex: number;
  label: string;
  matchedBy: 'id' | 'uri-rule';
}

export interface CoverageNotice {
  side: 'baseline' | 'candidate';
  pointer: string;
  code: string;
  message: string;
}

export interface AuditReport {
  schemaVersion: '1.0';
  toolVersion: string;
  profileVersion: 'static-image-1';
  fingerprintVersion: '1';
  generatedAt: string;
  baseline: SourceRef;
  candidate: SourceRef;
  policy: AuditPolicy;
  status: 'pass' | 'review' | 'fail' | 'incomplete';
  summary: {
    errors: number;
    warnings: number;
    info: number;
    accepted: number;
    incomplete: number;
    matchedCanvases: number;
    removedCanvases: number;
    addedCanvases: number;
  };
  findings: Finding[];
  canvasPairs: CanvasPair[];
  coverage: CoverageNotice[];
}

export interface AuditInput {
  name: string;
  text: string;
}

export interface AuditOptions {
  policy?: AuditPolicy;
  /** Injected clock for deterministic tests, never an assertion of freshness. */
  generatedAt?: string;
}
