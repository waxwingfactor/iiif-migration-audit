import { useEffect, useMemo, useRef, useState } from 'react';
import { applyDecisions, emptyPolicy, parsePolicy } from '../core/index';
import type { AcceptedChange, AuditInput, AuditPolicy, AuditReport } from '../core/types';
import { renderCsv, renderHtml, renderJson } from '../report/index';
import { demo } from './demo';
import { InputPanel } from './InputPanel';
import { FindingDetail } from './FindingDetail';
import { PolicyPanel } from './PolicyPanel';
import { SourceInspector } from './SourceInspector';
import { saveFile } from './files';
import { Icon, Pagination } from './ui';
import {
  categoryLabels,
  statusLabels,
  valueText,
  type Failure,
  type Inspector,
  type Section,
  type Side,
} from './view-model';

export function App() {
  const [inputs, setInputs] = useState<Record<Side, AuditInput>>({
    baseline: { name: '', text: '' },
    candidate: { name: '', text: '' },
  });
  const [policy, setPolicy] = useState<AuditPolicy>(emptyPolicy);
  const [originalReport, setOriginalReport] = useState<AuditReport | null>(null);
  const [decisions, setDecisions] = useState<AcceptedChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [section, setSection] = useState<Section>('findings');
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [resolution, setResolution] = useState('all');
  const [findingPage, setFindingPage] = useState(0);
  const [pairPage, setPairPage] = useState(0);
  const [coveragePage, setCoveragePage] = useState(0);
  const [inspector, setInspector] = useState<Inspector | null>(null);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const report = useMemo<AuditReport | null>(
    () => (originalReport ? applyDecisions(originalReport, decisions) : null),
    [originalReport, decisions],
  );
  const indexedFindings = useMemo(
    () =>
      report?.findings.map((finding) => ({
        finding,
        text: `${finding.message} ${finding.path} ${finding.code} ${valueText(finding.before)} ${valueText(finding.after)}`.toLocaleLowerCase(),
      })) ?? [],
    [report],
  );
  const filtered = useMemo(
    () =>
      indexedFindings
        .filter(
          ({ finding, text }) =>
            (category === 'all' || finding.category === category) &&
            (resolution === 'all' ||
              (resolution === 'accepted' ? !!finding.accepted : !finding.accepted)) &&
            text.includes(search.toLocaleLowerCase()),
        )
        .map(({ finding }) => finding),
    [indexedFindings, category, resolution, search],
  );
  const visibleFindings = filtered.slice(findingPage * 100, (findingPage + 1) * 100);
  const activeFinding =
    visibleFindings.find((finding) => finding.id === selected) ?? visibleFindings[0];
  const orderedPairs = useMemo(
    () => [...(report?.canvasPairs ?? [])].sort((a, b) => a.baselineIndex - b.baselineIndex),
    [report],
  );
  const displayError = (message: string) => setError({ code: 'INPUT_ERROR', message });

  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(
    () => setFindingPage(0),
    [search, category, resolution, originalReport, filtered.length],
  );
  useEffect(() => setPairPage(0), [originalReport]);
  useEffect(() => setCoveragePage(0), [originalReport]);
  useEffect(() => {
    if (originalReport) {
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.closest('.results')?.scrollIntoView({ block: 'start' });
    }
  }, [originalReport]);

  function cancel() {
    requestId.current += 1;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
  }

  function invalidate() {
    cancel();
    setOriginalReport(null);
    setSelected(null);
    setError(null);
    setInspector(null);
  }

  function updateInput(side: Side, input: AuditInput) {
    invalidate();
    setInputs((current) => ({ ...current, [side]: input }));
  }

  function updatePolicy(next: AuditPolicy) {
    invalidate();
    setPolicy(next);
    setDecisions(next.acceptedChanges);
  }

  function run(nextInputs = inputs, nextPolicy = policy) {
    cancel();
    setError(null);
    setOriginalReport(null);
    setSelected(null);
    if (!nextInputs.baseline.text.trim() || !nextInputs.candidate.text.trim()) {
      displayError('Add both a baseline and a candidate manifest before comparing.');
      return;
    }
    let validatedPolicy: AuditPolicy;
    try {
      validatedPolicy = parsePolicy(JSON.stringify(nextPolicy));
    } catch (failure) {
      setError({ code: 'POLICY_ERROR', message: (failure as Error).message });
      setPolicyOpen(true);
      return;
    }
    setBusy(true);
    const currentRequest = ++requestId.current;
    try {
      const nextWorker = new Worker(new URL('./audit.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = nextWorker;
      nextWorker.onmessage = (
        event: MessageEvent<{ requestId: number; report?: AuditReport; error?: Failure }>,
      ) => {
        if (event.data.requestId !== requestId.current) return;
        setBusy(false);
        nextWorker.terminate();
        worker.current = null;
        if (event.data.error) {
          setError(event.data.error);
          return;
        }
        if (event.data.report) {
          setOriginalReport(event.data.report);
          setDecisions(validatedPolicy.acceptedChanges);
          setSection('findings');
          setSearch('');
          setCategory('all');
          setResolution('all');
        }
      };
      nextWorker.onerror = () => {
        if (currentRequest !== requestId.current) return;
        setBusy(false);
        nextWorker.terminate();
        worker.current = null;
        setError({
          code: 'WORKER_ERROR',
          message:
            'The comparison worker stopped unexpectedly. Try a smaller pair of manifests or use the CLI for this collection.',
        });
      };
      nextWorker.postMessage({ requestId: currentRequest, ...nextInputs, policy: validatedPolicy });
    } catch (failure) {
      setBusy(false);
      setError({
        code: 'BROWSER_ERROR',
        message: `Could not start the local comparison: ${(failure as Error).message}`,
      });
    }
  }

  function exploreDemo() {
    invalidate();
    const cleanPolicy = emptyPolicy();
    setInputs(demo);
    setPolicy(cleanPolicy);
    setDecisions([]);
    setPolicyOpen(false);
    run(demo, cleanPolicy);
  }

  function accept(id: string, reason: string) {
    const next = [
      ...decisions.filter((decision) => decision.findingId !== id),
      { findingId: id, reason },
    ];
    setDecisions(next);
    setPolicy((current) => ({ ...current, acceptedChanges: next }));
  }

  function resetDecision(id: string) {
    const next = decisions.filter((decision) => decision.findingId !== id);
    setDecisions(next);
    setPolicy((current) => ({ ...current, acceptedChanges: next }));
  }

  async function exportReport(format: 'html' | 'json' | 'csv') {
    if (!report) return;
    try {
      const content = await (format === 'html'
        ? renderHtml(report)
        : format === 'csv'
          ? renderCsv(report)
          : renderJson(report));
      saveFile(
        content,
        `iiif-audit.${format}`,
        format === 'html'
          ? 'text/html;charset=utf-8'
          : format === 'csv'
            ? 'text/csv;charset=utf-8'
            : 'application/json',
      );
    } catch (failure) {
      setError({
        code: 'EXPORT_ERROR',
        message: `The report could not be exported: ${(failure as Error).message}`,
      });
    }
  }

  const openFindings =
    report?.findings.filter((finding) => !finding.accepted && finding.severity !== 'info').length ??
    0;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to workbench
      </a>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="book" size={23} />
          </span>
          <div>
            <strong>IIIF Migration Audit</strong>
            <span>Collection release workbench</span>
          </div>
        </div>
        <nav aria-label="Main">
          <button
            type="button"
            className="text-button"
            aria-expanded={guideOpen}
            onClick={() => setGuideOpen(!guideOpen)}
          >
            Guide
          </button>
          <a
            href="https://github.com/waxwingfactor/iiif-migration-audit"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="intro">
          <div>
            <p className="intro-label">Preserve your collection’s meaning.</p>
            <h1>Review a manifest migration.</h1>
            <p className="intro-description">
              Compare a current manifest with its replacement to find changed pages, metadata,
              rights and identities.
            </p>
          </div>
          <div className="local-note">
            <Icon name="shield" size={21} />
            <div>
              <strong>Your files stay on this device.</strong>
              <span>No uploads, accounts or linked-resource downloads.</span>
            </div>
          </div>
        </section>
        {guideOpen && (
          <section className="guide-panel" aria-labelledby="guide-heading">
            <div className="section-title-row">
              <h2 id="guide-heading">From two manifests to a reviewable release</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close guide"
                onClick={() => setGuideOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <ol>
              <li>
                <strong>Add the baseline and candidate.</strong> Use full JSON exports of the same
                book or still-image object. Presentation 2.1 and 3.0 are supported.
              </li>
              <li>
                <strong>Compare and inspect the evidence.</strong> Each finding keeps the original
                before/after values and JSON pointers. Page pairing uses stable IDs or explicit URI
                rules.
              </li>
              <li>
                <strong>Record intentional changes.</strong> Add a reason for each accepted finding
                and export the policy to resume with the same evidence.
              </li>
              <li>
                <strong>Export the review.</strong> HTML is a standalone reading copy; JSON
                preserves the structured audit; CSV supports a finding register. Use the CLI for a
                whole corpus.
              </li>
            </ol>
            <p>
              A complete assessment covers the declared static-image profile. It does not fetch
              images, OCR payloads or remote annotations, test a viewer, or certify IIIF
              conformance. Unsupported or uninspected structures remain incomplete and cannot be
              waived into a pass.
            </p>
          </section>
        )}
        <div className="input-pair">
          <InputPanel
            side="baseline"
            value={inputs.baseline}
            onChange={(value) => updateInput('baseline', value)}
            onError={displayError}
          />
          <span className="pair-arrow">
            <Icon name="arrow" size={22} />
          </span>
          <InputPanel
            side="candidate"
            value={inputs.candidate}
            onChange={(value) => updateInput('candidate', value)}
            onError={displayError}
          />
        </div>
        <div className="action-bar">
          <div className="button-group">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !inputs.baseline.text.trim() || !inputs.candidate.text.trim()}
              onClick={() => run()}
            >
              {busy ? <span className="spinner" /> : <Icon name="arrow" />}
              {busy ? 'Comparing locally…' : 'Compare manifests'}
            </button>
            {busy ? (
              <button type="button" className="button button-subtle" onClick={cancel}>
                Cancel comparison
              </button>
            ) : (
              <button type="button" className="button button-subtle" onClick={exploreDemo}>
                Explore an example
              </button>
            )}
          </div>
          <button
            type="button"
            className={`text-button policy-toggle ${policyOpen ? 'is-active' : ''}`}
            aria-expanded={policyOpen}
            onClick={() => setPolicyOpen(!policyOpen)}
          >
            Comparison policy{' '}
            <span className="count">
              {policy.uriRules.length + (report ? decisions.length : policy.acceptedChanges.length)}
            </span>
            <span aria-hidden="true">{policyOpen ? '−' : '+'}</span>
          </button>
        </div>
        {policyOpen && (
          <PolicyPanel
            policy={policy}
            onChange={updatePolicy}
            onError={displayError}
            decisions={report ? decisions : policy.acceptedChanges}
          />
        )}
        {error && (
          <div className="error-banner" role="alert">
            <Icon name="warning" size={23} />
            <div>
              <strong>Comparison needs your attention</strong>
              <p>{error.message}</p>
              <code>
                {error.code}
                {error.pointer ? ` · ${error.pointer}` : ''}
              </code>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError(null)}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {busy && (
          <div className="working-note" role="status">
            <span className="spinner" />
            <div>
              <strong>Reading the evidence.</strong>
              <span>
                Checking identities, page order, metadata and supported content. You can cancel at
                any time.
              </span>
            </div>
          </div>
        )}
        {report ? (
          <section className="results" aria-labelledby="result-title">
            <div className={`result-summary result-${report.status}`}>
              <span className="result-symbol">
                <Icon name={report.status === 'pass' ? 'check' : 'warning'} size={24} />
              </span>
              <div>
                <h2 id="result-title" ref={resultHeading} tabIndex={-1}>
                  {statusLabels[report.status]}
                </h2>
                <p>
                  {openFindings} unresolved {openFindings === 1 ? 'finding' : 'findings'} ·{' '}
                  {report.summary.accepted} accepted · {report.canvasPairs.length} paired{' '}
                  {report.canvasPairs.length === 1 ? 'page' : 'pages'}
                  {report.coverage.length > 0
                    ? ` · ${report.coverage.length} coverage ${report.coverage.length === 1 ? 'limitation' : 'limitations'}`
                    : ''}
                </p>
              </div>
              <span className="profile-tag">Static-image profile</span>
            </div>
            <div className="report-context">
              <div>
                <strong>{report.baseline.label || report.baseline.name}</strong>
                <span>
                  {report.baseline.version} <span aria-hidden="true">→</span>{' '}
                  {report.candidate.version} · Original JSON is retained for inspection.
                </span>
              </div>
              <details className="export-menu">
                <summary>
                  <Icon name="download" />
                  Export report
                </summary>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      void exportReport('html');
                    }}
                  >
                    HTML reading copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void exportReport('json');
                    }}
                  >
                    JSON evidence
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void exportReport('csv');
                    }}
                  >
                    CSV findings
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      saveFile(
                        JSON.stringify({ ...policy, acceptedChanges: decisions }, null, 2),
                        'iiif-audit-policy.json',
                        'application/json',
                      )
                    }
                  >
                    Review policy
                  </button>
                </div>
              </details>
            </div>
            {decisions.length > 0 && (
              <p className="review-persistence">
                Review decisions are held in this tab. Export the review policy to save or share
                them.
              </p>
            )}
            <div
              className="result-tabs"
              role="tablist"
              aria-label="Audit views"
              onKeyDown={(event) => {
                const tabs = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                ];
                const current = tabs.indexOf(event.target as HTMLButtonElement);
                const next =
                  event.key === 'ArrowRight'
                    ? (current + 1) % tabs.length
                    : event.key === 'ArrowLeft'
                      ? (current - 1 + tabs.length) % tabs.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? tabs.length - 1
                          : -1;
                if (next !== -1) {
                  event.preventDefault();
                  tabs[next]?.click();
                  tabs[next]?.focus();
                }
              }}
            >
              {(
                [
                  ['findings', 'Findings', report.findings.length],
                  ['pages', 'Page sequence', report.canvasPairs.length],
                  ['coverage', 'Coverage', report.coverage.length],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`tab-${value}`}
                  aria-selected={section === value}
                  aria-controls={`panel-${value}`}
                  tabIndex={section === value ? 0 : -1}
                  onClick={() => setSection(value)}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <div
              id="panel-findings"
              role="tabpanel"
              aria-labelledby="tab-findings"
              hidden={section !== 'findings'}
            >
              <div className="findings-toolbar">
                <label className="search-box">
                  <Icon name="search" />
                  <span className="visually-hidden">Search findings</span>
                  <input
                    type="search"
                    value={search}
                    placeholder="Search text, paths or codes"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label>
                  <span className="visually-hidden">Filter category</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">All categories</option>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="visually-hidden">Filter decision status</span>
                  <select
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                  >
                    <option value="all">All decisions</option>
                    <option value="open">Unresolved</option>
                    <option value="accepted">Accepted</option>
                  </select>
                </label>
                <span className="filter-count" aria-live="polite">
                  {filtered.length} of {report.findings.length}
                </span>
              </div>
              {filtered.length > 0 && activeFinding ? (
                <div className="review-layout">
                  <div className="finding-register">
                    <h3 className="register-heading">Finding register</h3>
                    <ul>
                      {visibleFindings.map((finding, index) => (
                        <li key={finding.id}>
                          <button
                            type="button"
                            className={`finding-row ${activeFinding.id === finding.id ? 'is-selected' : ''}`}
                            aria-pressed={activeFinding.id === finding.id}
                            onClick={() => {
                              setSelected(finding.id);
                              if (window.matchMedia('(max-width: 760px)').matches)
                                requestAnimationFrame(() => {
                                  const heading = document.getElementById('finding-heading');
                                  heading?.focus({ preventScroll: true });
                                  heading?.scrollIntoView({ block: 'start' });
                                });
                            }}
                          >
                            <span
                              className={`finding-dot dot-${finding.accepted ? 'accepted' : finding.severity}`}
                            />
                            <span className="row-content">
                              <span className="finding-row-meta">
                                {String(findingPage * 100 + index + 1).padStart(2, '0')} ·{' '}
                                {categoryLabels[finding.category] ?? finding.category}
                                {finding.accepted ? ' · Accepted' : ''}
                              </span>
                              <strong>{finding.message}</strong>
                              <code>{finding.path}</code>
                            </span>
                            <span className="row-chevron" aria-hidden="true">
                              ›
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <Pagination
                      label="Finding register pages"
                      total={filtered.length}
                      page={findingPage}
                      onChange={setFindingPage}
                    />
                  </div>
                  <FindingDetail
                    finding={activeFinding}
                    onAccept={accept}
                    onReset={resetDecision}
                    onInspect={setInspector}
                  />
                </div>
              ) : (
                <div className="empty-findings">
                  <Icon name={report.status === 'pass' ? 'check' : 'search'} size={30} />
                  <h3>
                    {report.findings.length === 0
                      ? 'No preservation differences found'
                      : 'No findings match these filters'}
                  </h3>
                  <p>
                    {report.findings.length === 0
                      ? 'Review Coverage before making your release decision. A clean comparison applies to the assessed profile.'
                      : 'Try another category, decision status or search term.'}
                  </p>
                  {report.findings.length > 0 && (
                    <button
                      type="button"
                      className="button button-subtle"
                      onClick={() => {
                        setSearch('');
                        setCategory('all');
                        setResolution('all');
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
            <div
              id="panel-pages"
              role="tabpanel"
              aria-labelledby="tab-pages"
              hidden={section !== 'pages'}
            >
              <div className="page-panel-intro">
                <h3>Page identity and sequence</h3>
                <p>
                  {report.summary.matchedCanvases} paired · {report.summary.removedCanvases} removed
                  · {report.summary.addedCanvases} added. Pairs use exact Canvas IDs or explicit
                  Canvas rules. Unpaired pages are detailed in Findings.
                </p>
              </div>
              <div className="page-sequence">
                <span>Candidate order</span>
                <div>
                  {[...report.canvasPairs]
                    .sort((a, b) => a.candidateIndex - b.candidateIndex)
                    .slice(0, 200)
                    .map((pair) => (
                      <span
                        className={`sequence-page ${pair.baselineIndex !== pair.candidateIndex ? 'sequence-moved' : ''}`}
                        key={pair.baselineId}
                        title={`${pair.label} · baseline ${pair.baselineIndex + 1}, candidate ${pair.candidateIndex + 1}`}
                      >
                        {pair.baselineIndex + 1}
                      </span>
                    ))}
                </div>
                <p>
                  Numbers refer to the original baseline positions of paired pages. Highlighting
                  marks a changed position.
                  {report.canvasPairs.length > 200
                    ? ' The strip previews the first 200 paired pages; the table and exports include every pair.'
                    : ''}
                </p>
              </div>
              <div className="table-scroll">
                <table className="pair-table">
                  <caption>Matched Canvas identities, in baseline order</caption>
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Baseline</th>
                      <th>Candidate</th>
                      <th>Pairing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedPairs.slice(pairPage * 100, (pairPage + 1) * 100).map((pair) => (
                      <tr key={pair.baselineId}>
                        <th scope="row">{pair.label || 'Untitled Canvas'}</th>
                        <td>
                          <span className="page-number">{pair.baselineIndex + 1}</span>
                          <code>{pair.baselineId}</code>
                        </td>
                        <td>
                          <span
                            className={`page-number ${pair.baselineIndex !== pair.candidateIndex ? 'moved' : ''}`}
                          >
                            {pair.candidateIndex + 1}
                          </span>
                          <code>{pair.candidateId}</code>
                        </td>
                        <td>{pair.matchedBy === 'id' ? 'Exact ID' : 'URI rule'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.canvasPairs.length === 0 && (
                  <p className="policy-empty">
                    No unambiguous Canvas pairs were established. Inspect the findings and coverage
                    notices.
                  </p>
                )}
              </div>
              <Pagination
                label="Canvas pair pages"
                total={report.canvasPairs.length}
                page={pairPage}
                onChange={setPairPage}
              />
            </div>
            <div
              id="panel-coverage"
              role="tabpanel"
              aria-labelledby="tab-coverage"
              hidden={section !== 'coverage'}
            >
              <div className="coverage-intro">
                <Icon name={report.coverage.length ? 'warning' : 'shield'} size={26} />
                <div>
                  <h3>
                    {report.coverage.length
                      ? 'Some structures could not be fully assessed'
                      : 'The declared comparison profile was assessed'}
                  </h3>
                  <p>
                    {report.coverage.length
                      ? 'Incomplete evidence prevents a pass even when the compared fields look unchanged. These limitations cannot be accepted away.'
                      : 'This result applies to supported static-image facts extracted from the supplied JSON. It is not a universal preservation guarantee.'}
                  </p>
                </div>
              </div>
              {report.coverage.length > 0 && (
                <ul className="coverage-list">
                  {report.coverage
                    .slice(coveragePage * 100, (coveragePage + 1) * 100)
                    .map((notice, index) => (
                      <li key={`${notice.side}-${notice.pointer}-${index}`}>
                        <span className="severity severity-warning">
                          {notice.side === 'baseline' ? 'Baseline' : 'Candidate'}
                        </span>
                        <div>
                          <strong>{notice.message}</strong>
                          <code>{notice.pointer || '(document root)'}</code>
                          <span>{notice.code}</span>
                        </div>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setInspector({ side: notice.side, pointer: notice.pointer })
                          }
                        >
                          Inspect
                        </button>
                      </li>
                    ))}
                </ul>
              )}
              <Pagination
                label="Coverage notice pages"
                total={report.coverage.length}
                page={coveragePage}
                onChange={setCoveragePage}
              />
              <div className="scope-columns">
                <section>
                  <h4>Assessed in the static-image profile</h4>
                  <p>
                    Supported manifest metadata and rights, Canvas identities and ordering,
                    geometry, embedded image painting content, image-service references, and
                    supported navigation and links. Every unhandled structure is surfaced above.
                  </p>
                </section>
                <section>
                  <h4>Use complementary checks for</h4>
                  <p>
                    IIIF specification conformance, image pixels and visual quality, remote OCR and
                    annotation payloads, availability, CORS, authorization, and how the release
                    behaves in a viewer.
                  </p>
                </section>
              </div>
              <dl className="report-provenance">
                <div>
                  <dt>Baseline SHA-256</dt>
                  <dd>
                    <code>{report.baseline.sha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Candidate SHA-256</dt>
                  <dd>
                    <code>{report.candidate.sha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Engine / profile</dt>
                  <dd>
                    {report.toolVersion} / {report.profileVersion} · fingerprint{' '}
                    {report.fingerprintVersion}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        ) : (
          !busy && (
            <section className="start-state">
              <div className="start-rule">
                <span />
                <Icon name="book" size={27} />
                <span />
              </div>
              <h2>A valid manifest can still lose something important.</h2>
              <p>
                Compare independently generated exports to catch missing text, changed page order
                and broken identity continuity before publication.
              </p>
              <div className="start-steps">
                <span>
                  <b>1</b> Add two manifests
                </span>
                <span>
                  <b>2</b> Inspect the changes
                </span>
                <span>
                  <b>3</b> Keep the evidence
                </span>
              </div>
              <p className="scope-note">
                For embedded still-image Presentation 2.1 / 3.0 manifests. Unsupported content stays
                visible as incomplete.
              </p>
            </section>
          )
        )}
        <footer>
          <span>Independent comparison. Traceable decisions.</span>
          <span>MIT open source · Local by design</span>
        </footer>
      </main>
      {inspector && (
        <SourceInspector inspector={inspector} inputs={inputs} onClose={() => setInspector(null)} />
      )}
    </>
  );
}
