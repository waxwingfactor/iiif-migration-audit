import { csvRows, escapeHtml, htmlDocument, renderAuditBody, statusLabel } from '../report/index';
import type { BatchReport } from './types';

export function renderBatchJson(report: BatchReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}

export function renderBatchCsv(report: BatchReport): string {
  const rows: unknown[][] = [
    [
      'record',
      'pair_key',
      'status',
      'id',
      'code',
      'severity',
      'category',
      'path',
      'message',
      'before_json',
      'after_json',
      'baseline_pointer',
      'candidate_pointer',
      'accepted_reason',
    ],
    [
      'batch',
      '',
      report.status,
      '',
      '',
      '',
      '',
      '',
      JSON.stringify(report.summary),
      '',
      '',
      '',
      '',
      '',
    ],
  ];
  for (const issue of report.issues)
    rows.push([
      'issue',
      issue.key ?? '',
      'incomplete',
      '',
      issue.code,
      '',
      '',
      '',
      issue.message,
      '',
      '',
      '',
      '',
      '',
    ]);
  for (const pair of report.pairs) {
    rows.push([
      'pair',
      pair.key,
      pair.report?.status ?? 'error',
      '',
      pair.error?.code ?? '',
      '',
      '',
      '',
      pair.error?.message ?? JSON.stringify(pair.report?.summary),
      '',
      '',
      '',
      '',
      '',
    ]);
    if (!pair.report) continue;
    for (const side of ['baseline', 'candidate'] as const) {
      const source = pair.report[side];
      rows.push([
        'source',
        pair.key,
        '',
        source.sha256,
        side,
        '',
        '',
        '',
        source.name,
        JSON.stringify(source.id),
        JSON.stringify(source.version),
        '',
        '',
        '',
      ]);
    }
    for (const finding of pair.report.findings)
      rows.push([
        'finding',
        pair.key,
        finding.accepted ? 'accepted' : 'open',
        finding.id,
        finding.code,
        finding.severity,
        finding.category,
        finding.path,
        finding.message,
        JSON.stringify(finding.before),
        JSON.stringify(finding.after),
        finding.pointers.baseline,
        finding.pointers.candidate,
        finding.accepted?.reason ?? '',
      ]);
    for (const notice of pair.report.coverage)
      rows.push([
        'coverage',
        pair.key,
        'incomplete',
        '',
        notice.code,
        '',
        'coverage',
        notice.pointer,
        notice.message,
        '',
        '',
        notice.side === 'baseline' ? notice.pointer : '',
        notice.side === 'candidate' ? notice.pointer : '',
        '',
      ]);
  }
  return csvRows(rows);
}

export function renderBatchHtml(report: BatchReport): string {
  const issues = report.issues.length
    ? '<h2>Corpus issues</h2>' +
      report.issues
        .map(
          (issue) =>
            '<article class="coverage"><h3>' +
            escapeHtml(issue.message) +
            '</h3><code>' +
            escapeHtml(issue.code) +
            '</code></article>',
        )
        .join('')
    : '';
  const pairs = report.pairs
    .map(
      (pair) =>
        '<section><h2>' +
        escapeHtml(pair.key) +
        '</h2><p class="muted">' +
        escapeHtml(pair.baseline) +
        ' → ' +
        escapeHtml(pair.candidate) +
        '</p>' +
        (pair.report
          ? renderAuditBody(pair.report)
          : '<div class="verdict fail"><strong>Input or execution error</strong><p>' +
            escapeHtml(pair.error?.message ?? 'No report produced.') +
            '</p><code>' +
            escapeHtml(pair.error?.code ?? 'UNKNOWN_ERROR') +
            '</code></div>') +
        '</section>',
    )
    .join('');
  return htmlDocument(
    'IIIF Migration Audit — corpus report',
    '<header><p class="eyebrow">IIIF Migration Audit · corpus report</p><h1>Corpus comparison</h1><p class="muted">' +
      escapeHtml(report.summary.processed) +
      ' of ' +
      escapeHtml(report.summary.requested) +
      ' requested pairs processed.</p></header><div class="verdict ' +
      escapeHtml(report.status) +
      '"><strong>' +
      escapeHtml(
        report.status === 'error' ? 'Input or execution errors' : statusLabel(report.status),
      ) +
      '</strong><p>' +
      escapeHtml(report.summary.passed) +
      ' pass · ' +
      escapeHtml(report.summary.review) +
      ' need review · ' +
      escapeHtml(report.summary.failed) +
      ' fail · ' +
      escapeHtml(report.summary.incomplete) +
      ' incomplete · ' +
      escapeHtml(report.summary.errors) +
      ' errors · ' +
      escapeHtml(report.summary.issues) +
      ' corpus issues</p></div>' +
      issues +
      pairs +
      '<footer>Tool ' +
      escapeHtml(report.toolVersion) +
      ' · generated ' +
      escapeHtml(report.generatedAt) +
      '. Static-image preservation checks only. Image bytes, linked payloads, remote availability, authentication, CORS and viewer rendering are not verified. This report is self-contained and makes no network requests.</footer>',
  );
}
