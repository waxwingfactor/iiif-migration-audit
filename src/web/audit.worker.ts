import { audit } from '../core/index';
import type { AuditInput, AuditPolicy } from '../core/types';

interface Request {
  requestId: number;
  baseline: AuditInput;
  candidate: AuditInput;
  policy: AuditPolicy;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { requestId, baseline, candidate, policy } = event.data;
  try {
    const report = await audit(baseline, candidate, { policy });
    self.postMessage({ requestId, report });
  } catch (error) {
    const detail = error as { code?: unknown; message?: unknown; pointer?: unknown };
    self.postMessage({
      requestId,
      error: {
        code: typeof detail.code === 'string' ? detail.code : 'AUDIT_ERROR',
        message:
          typeof detail.message === 'string'
            ? detail.message
            : 'The comparison could not be completed.',
        pointer: typeof detail.pointer === 'string' ? detail.pointer : undefined,
      },
    });
  }
};
