import type { AuditReport, Finding, JsonValue } from '../core/types';

/** JSON is the complete, lossless report interchange. */
export function renderJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(
      /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,
      (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
    )
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Apostrophe-prefix cells that spreadsheet applications might treat as formulas. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+@-]/u.test(text.trimStart()) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function csvRows(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Evidence remains JSON-encoded inside cells, retaining types and multiplicity. */
export function auditCsvRows(report: AuditReport): unknown[][] {
  const rows: unknown[][] = [
    [
      'record',
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
      'audit',
      report.status,
      '',
      '',
      '',
      '',
      '',
      report.baseline.name + ' → ' + report.candidate.name,
      '',
      '',
      '',
      '',
      '',
    ],
    [
      'source',
      '',
      report.baseline.sha256,
      'baseline',
      '',
      '',
      '',
      report.baseline.name,
      JSON.stringify(report.baseline),
      '',
      '',
      '',
      '',
    ],
    [
      'source',
      '',
      report.candidate.sha256,
      'candidate',
      '',
      '',
      '',
      report.candidate.name,
      JSON.stringify(report.candidate),
      '',
      '',
      '',
      '',
    ],
    [
      'summary',
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
  const metadata = {
    schemaVersion: report.schemaVersion,
    toolVersion: report.toolVersion,
    profileVersion: report.profileVersion,
    fingerprintVersion: report.fingerprintVersion,
    generatedAt: report.generatedAt,
  };
  for (const [key, value] of Object.entries(metadata))
    rows.push([
      'reproducibility',
      '',
      '',
      key,
      '',
      '',
      '',
      value,
      JSON.stringify(value),
      '',
      '',
      '',
      '',
    ]);
  rows.push([
    'policy',
    '',
    '',
    'ACTIVE_POLICY',
    '',
    '',
    'policy',
    'Effective URI rules and saved decisions',
    JSON.stringify(report.policy),
    '',
    '',
    '',
    '',
  ]);
  for (const pair of report.canvasPairs)
    rows.push([
      'canvas_pair',
      '',
      pair.baselineId,
      pair.matchedBy,
      '',
      'identity',
      'canvasPairs',
      pair.label,
      JSON.stringify({ id: pair.baselineId, index: pair.baselineIndex }),
      JSON.stringify({ id: pair.candidateId, index: pair.candidateIndex }),
      '',
      '',
      '',
    ]);
  for (const finding of report.findings) {
    rows.push([
      'finding',
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
  }
  for (const notice of report.coverage) {
    rows.push([
      'coverage',
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
  return rows;
}

export function renderCsv(report: AuditReport): string {
  return csvRows(auditCsvRows(report));
}

const STATUS_LABELS: Record<AuditReport['status'], string> = {
  pass: 'No unapproved assessed changes',
  review: 'Changes need review',
  fail: 'Preservation changes detected',
  incomplete: 'Assessment incomplete',
};

export function statusLabel(status: AuditReport['status']): string {
  return STATUS_LABELS[status] ?? 'Unknown assessment status';
}

const STYLE = `
:root{color-scheme:light;--ink:#172B45;--muted:#50627A;--line:#D6DFEB;--paper:#fff;--wash:#F7F9FC;--accent:#2359A6}
*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1120px;margin:auto;padding:48px 32px 72px}header{border-top:5px solid var(--accent);padding-top:22px;margin-bottom:30px}.eyebrow{font-size:12px;font-weight:750;color:var(--accent)}h1{font-size:clamp(28px,4vw,42px);letter-spacing:-.04em;line-height:1.15;margin:10px 0 16px}h2{font-size:24px;letter-spacing:-.025em;line-height:1.3;margin:32px 0 16px}h3{font-size:18px;line-height:1.35;margin:8px 0}p{margin:8px 0 14px}.muted,small{color:var(--muted)}.verdict,.source,.finding,.coverage,.panel{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:22px}.verdict{border-left:5px solid var(--accent);margin:22px 0}.verdict strong{font-size:22px}.verdict.fail{border-left-color:#AC3144}.verdict.review{border-left-color:#81540D}.verdict.incomplete{border-left-color:#6d5087}.sources,.evidence{display:grid;grid-template-columns:1fr 1fr;gap:16px}.source h2{margin:0 0 12px;font-size:15px;color:var(--muted)}.name{font-weight:700;overflow-wrap:anywhere}.stats{display:flex;flex-wrap:wrap;gap:12px 26px;margin:20px 0}.stats div{min-width:95px}.stats b{display:block;font-size:28px;line-height:1.2}.stats span{font-size:12px;color:var(--muted)}code,pre{font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}code{white-space:pre-wrap}pre{white-space:pre-wrap;word-break:break-word;margin:10px 0 0;padding:14px;border:1px solid var(--line);background:#F7F9FC;border-radius:5px;max-height:480px;overflow:auto}.finding,.coverage{margin:14px 0}.finding-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.chip{display:inline-block;padding:2px 8px;border:1px solid currentColor;border-radius:4px;font-size:11px;font-weight:750;white-space:nowrap}.error{color:#AC3144}.warning{color:#81540D}.info,.accepted{color:#176C60}.path{font-size:13px;color:var(--muted);overflow-wrap:anywhere}.evidence h4{font-size:12px;color:var(--muted);margin:15px 0 0}summary{cursor:pointer;font-weight:650;padding:7px 0}details{margin-top:14px}details[open]>summary{margin-bottom:10px}.note{font-size:14px;border-left:3px solid var(--line);padding-left:14px}.finding-id{font-size:11px;color:var(--muted);word-break:break-all}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}th{color:var(--muted);font-weight:650}.table-wrap{overflow:auto}footer{border-top:1px solid var(--line);margin-top:36px;padding-top:20px;font-size:13px;color:var(--muted)}@media(max-width:650px){main{padding:26px 16px 48px}.sources,.evidence{grid-template-columns:1fr}.finding,.source,.verdict,.coverage,.panel{padding:16px}.finding-head{display:block}.chip{margin-bottom:8px}.stats{gap:16px}}@media print{body{background:#fff}main{max-width:none;padding:0}details{display:block}details>*{display:block!important}pre{max-height:none;overflow:visible}.finding,.source{break-inside:avoid}header{margin-top:0}.sources{grid-template-columns:1fr 1fr}}
`;

/** Safe static shell shared by single and corpus reports: no scripts or remote assets. */
export function htmlDocument(title: string, content: string): string {
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">" +
    '<meta name="referrer" content="no-referrer"><title>' +
    escapeHtml(title) +
    '</title><style>' +
    STYLE +
    '</style></head><body><main>' +
    content +
    '</main></body></html>\n'
  );
}

function evidence(value: JsonValue): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function renderFinding(finding: Finding, index: number): string {
  return (
    '<article class="finding"><div class="finding-head"><div><span class="eyebrow">Finding ' +
    (index + 1) +
    '</span><h3>' +
    escapeHtml(finding.message) +
    '</h3></div><span class="chip ' +
    (finding.accepted ? 'accepted' : escapeHtml(finding.severity)) +
    '">' +
    escapeHtml(finding.accepted ? 'accepted' : finding.severity) +
    '</span></div><p class="path"><code>' +
    escapeHtml(finding.code) +
    '</code> · ' +
    escapeHtml(finding.category) +
    ' · <code>' +
    escapeHtml(finding.path) +
    '</code></p>' +
    (finding.accepted
      ? '<p class="note"><strong>Accepted intentional change.</strong> ' +
        escapeHtml(finding.accepted.reason) +
        '</p>'
      : '') +
    '<div class="evidence"><section><h4>Baseline</h4><pre>' +
    evidence(finding.before) +
    '</pre><p class="path">Source pointer: <code>' +
    escapeHtml(finding.pointers.baseline ?? 'Not present') +
    '</code></p></section><section><h4>Candidate</h4><pre>' +
    evidence(finding.after) +
    '</pre><p class="path">Source pointer: <code>' +
    escapeHtml(finding.pointers.candidate ?? 'Not present') +
    '</code></p></section></div><p class="finding-id">Decision fingerprint: ' +
    escapeHtml(finding.id) +
    '</p></article>'
  );
}

export function renderAuditBody(report: AuditReport): string {
  const source = (side: 'baseline' | 'candidate'): string => {
    const value = report[side];
    return (
      '<section class="source"><h2>' +
      (side === 'baseline' ? 'Baseline · before' : 'Candidate · after') +
      '</h2><p class="name">' +
      escapeHtml(value.name) +
      '</p><p>' +
      escapeHtml(value.label) +
      '</p><p class="path"><code>' +
      escapeHtml(value.id ?? 'No supported manifest identifier') +
      '</code></p><small>Presentation ' +
      escapeHtml(value.version) +
      ' · ' +
      escapeHtml(value.canvasCount) +
      ' canvases</small><details><summary>Snapshot hash</summary><code>' +
      escapeHtml(value.sha256) +
      '</code></details></section>'
    );
  };
  const stats = [
    [report.summary.errors, 'Errors'],
    [report.summary.warnings, 'Warnings'],
    [report.summary.accepted, 'Accepted'],
    [report.summary.incomplete, 'Unassessed'],
    [report.summary.matchedCanvases, 'Paired pages'],
  ]
    .map(
      ([count, label]) =>
        '<div><b>' + escapeHtml(count) + '</b><span>' + escapeHtml(label) + '</span></div>',
    )
    .join('');
  const coverage = report.coverage.length
    ? '<h2>Incomplete coverage</h2><p class="muted">These structures were not fully assessed. Expected-change decisions do not complete these checks.</p>' +
      report.coverage
        .map(
          (notice) =>
            '<article class="coverage"><span class="chip">' +
            escapeHtml(notice.side) +
            '</span><h3>' +
            escapeHtml(notice.message) +
            '</h3><p class="path"><code>' +
            escapeHtml(notice.code) +
            '</code> · <code>' +
            escapeHtml(notice.pointer) +
            '</code></p></article>',
        )
        .join('')
    : '';
  const pairs = report.canvasPairs.length
    ? '<details class="panel"><summary>Canvas pairing · ' +
      report.canvasPairs.length +
      '</summary><div class="table-wrap"><table><thead><tr><th scope="col">Page</th><th scope="col">Baseline ID / position</th><th scope="col">Candidate ID / position</th><th scope="col">Matched by</th></tr></thead><tbody>' +
      report.canvasPairs
        .map(
          (pair) =>
            '<tr><td>' +
            escapeHtml(pair.label) +
            '</td><td><code>' +
            escapeHtml(pair.baselineId) +
            '</code><br>' +
            escapeHtml(pair.baselineIndex + 1) +
            '</td><td><code>' +
            escapeHtml(pair.candidateId) +
            '</code><br>' +
            escapeHtml(pair.candidateIndex + 1) +
            '</td><td>' +
            escapeHtml(pair.matchedBy) +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div></details>'
    : '';
  return (
    '<div class="verdict ' +
    escapeHtml(report.status) +
    '"><strong>' +
    escapeHtml(statusLabel(report.status)) +
    '</strong><p>Assessment: ' +
    escapeHtml(report.profileVersion) +
    '. This result covers the declared static-image preservation checks.</p></div><div class="sources">' +
    source('baseline') +
    source('candidate') +
    '</div><div class="stats">' +
    stats +
    '</div>' +
    coverage +
    '<h2>Preservation findings</h2>' +
    (report.findings.length
      ? report.findings.map(renderFinding).join('')
      : '<div class="panel"><p>No differences were found in the assessed facts.</p></div>') +
    pairs +
    '<details class="panel"><summary>Policy and reproducibility</summary><pre>' +
    escapeHtml(JSON.stringify(report.policy, null, 2)) +
    '</pre><p class="muted">Tool ' +
    escapeHtml(report.toolVersion) +
    ' · profile ' +
    escapeHtml(report.profileVersion) +
    ' · fingerprint ' +
    escapeHtml(report.fingerprintVersion) +
    ' · generated ' +
    escapeHtml(report.generatedAt) +
    '</p></details>'
  );
}

export function renderHtml(report: AuditReport): string {
  return htmlDocument(
    'IIIF Migration Audit — ' + statusLabel(report.status),
    '<header><p class="eyebrow">IIIF Migration Audit · review report</p><h1>Manifest comparison</h1><p class="muted">An independent comparison of your saved baseline and candidate manifests.</p></header>' +
      renderAuditBody(report) +
      '<footer>This audit does not verify image bytes, linked OCR payloads, remote availability, authentication, CORS or viewer rendering. It complements IIIF conformance validation. HTML in source values is displayed as inert text; directional controls are shown as Unicode escapes. All data in this report is embedded; opening it makes no network requests.</footer>',
  );
}
