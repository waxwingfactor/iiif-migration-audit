import type { AuditReport } from '../core/types';

export interface PairDefinition {
  key: string;
  baseline: string;
  candidate: string;
}
export interface BatchIssue {
  code: string;
  message: string;
  key?: string;
}
export interface BatchPairResult {
  key: string;
  baseline: string;
  candidate: string;
  report: AuditReport | null;
  error: { code: string; message: string } | null;
}
export interface BatchReport {
  schemaVersion: '1.0';
  kind: 'batch';
  toolVersion: string;
  generatedAt: string;
  status: AuditReport['status'] | 'error';
  summary: {
    requested: number;
    processed: number;
    passed: number;
    review: number;
    failed: number;
    incomplete: number;
    errors: number;
    issues: number;
  };
  pairs: BatchPairResult[];
  issues: BatchIssue[];
}

export const EXIT_CODES = { pass: 0, review: 1, fail: 2, incomplete: 3, error: 4 } as const;
