import { describe, expect, it } from 'vitest';
import type { AuditReport } from '../src/core/types';
import { csvCell, renderCsv, renderHtml, renderJson } from '../src/report/index';

function report(): AuditReport {
  return {
    schemaVersion: '1.0',
    toolVersion: '0.1.0',
    profileVersion: 'static-image-1',
    fingerprintVersion: '1',
    generatedAt: '2026-10-15T12:00:00Z',
    baseline: {
      name: 'baseline.json',
      sha256: 'a'.repeat(64),
      version: '2.1',
      id: 'https://example.org/book',
      label: 'Bilingual book',
      canvasCount: 2,
    },
    candidate: {
      name: 'candidate.json',
      sha256: 'b'.repeat(64),
      version: '3.0',
      id: 'https://example.org/book',
      label: 'Bilingual book',
      canvasCount: 2,
    },
    policy: { schemaVersion: '1.0', uriRules: [], acceptedChanges: [] },
    status: 'fail',
    summary: {
      errors: 1,
      warnings: 0,
      info: 0,
      accepted: 0,
      incomplete: 0,
      matchedCanvases: 2,
      removedCanvases: 0,
      addedCanvases: 0,
    },
    findings: [
      {
        id: 'c'.repeat(64),
        code: 'TEXT_LOST',
        severity: 'error',
        category: 'description',
        message: 'French title was removed',
        path: 'manifest.label.fr',
        before: ['Un livre'],
        after: null,
        pointers: { baseline: '/label/1', candidate: '/label' },
        accepted: null,
      },
    ],
    canvasPairs: [
      {
        baselineId: 'https://example.org/canvas/1',
        candidateId: 'https://example.org/canvas/1',
        baselineIndex: 0,
        candidateIndex: 0,
        label: '1',
        matchedBy: 'id',
      },
    ],
    coverage: [],
  };
}

describe('portable reports', () => {
  it('preserves complete JSON evidence including types, multiplicity and decisions', () => {
    const value = report();
    value.findings[0]!.before = ['é', 'é', '<b>credit</b>', { __proto__: null, value: false }];
    expect(JSON.parse(renderJson(value))).toEqual(value);
    expect(renderJson(value).endsWith('\n')).toBe(true);
  });

  it('renders hostile content as inert text without scripts, resource loads or unsafe links', () => {
    const value = report();
    const attack =
      '</style><script>alert(1)</script><img src="https://evil.test/tracker" onerror="alert(2)">';
    value.baseline.name = attack;
    value.baseline.label = attack;
    value.baseline.id = 'javascript:alert(3)';
    value.findings[0]!.message = attack;
    value.findings[0]!.before = attack + '\u202e';
    value.findings[0]!.accepted = { reason: attack };
    value.coverage.push({ side: 'baseline', code: attack, message: attack, pointer: attack });
    const html = renderHtml(value);
    expect(html).not.toMatch(/<(?:script|img|iframe|link)\b|<[^>]+\s(?:href|src|onerror)\s*=/iu);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('\\u202e');
    expect(html).not.toContain('\u202e');
  });

  it('includes source hashes, exact pointers, accepted reasons and incomplete coverage', () => {
    const value = report();
    value.status = 'incomplete';
    value.findings[0]!.accepted = { reason: 'Corrected institutional credit' };
    value.coverage.push({
      side: 'candidate',
      code: 'EXTERNAL_PAGE',
      message: 'Linked annotations were not read',
      pointer: '/annotations/0',
    });
    const html = renderHtml(value);
    expect(html).toContain('Assessment incomplete');
    expect(html).toContain(value.baseline.sha256);
    expect(html).toContain('/label/1');
    expect(html).toContain('Corrected institutional credit');
    expect(html).toContain('/annotations/0');
    expect(html).toContain('does not verify image bytes');
  });

  it.each(['=SUM(A1:A2)', '+cmd', '-2+3', '@SUM(1)', '\t=1', '  =1', '\r\n=2', '\ufeff=1'])(
    'neutralizes spreadsheet formula input %j',
    (value) => {
      expect(csvCell(value)).toBe('"\'' + value.replaceAll('"', '""') + '"');
    },
  );

  it('escapes CSV quoting/newlines and retains unchanged safe values', () => {
    expect(csvCell('quoted "value"\nnext')).toBe('"quoted ""value""\nnext"');
    expect(csvCell('https://example.org/image')).toBe('"https://example.org/image"');
    expect(csvCell(null)).toBe('""');
    const value = report();
    value.baseline.name = '=HYPERLINK("bad")';
    const csv = renderCsv(value);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")');
    expect(csv).toContain('"TEXT_LOST"');
    expect(csv).toContain('"/label/1"');
    expect(csv).toContain('"[""Un livre""]"');
    expect(csv).toContain(value.candidate.sha256);
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
