import { useEffect, useState } from 'react';
import type { Finding, JsonValue } from '../core/types';
import { categoryLabels, valueText, type Inspector, type Side } from './view-model';
import { Icon } from './ui';

function Evidence({
  title,
  value,
  pointer,
  side,
  onInspect,
}: {
  title: string;
  value: JsonValue;
  pointer: string | null;
  side: Side;
  onInspect: (inspector: Inspector) => void;
}) {
  const fullValue = valueText(value);
  const preview =
    fullValue.length > 30000
      ? `${fullValue.slice(0, 30000)}\n\n[Preview limited to 30,000 characters. Export JSON for the complete evidence.]`
      : fullValue;
  return (
    <section className={`evidence evidence-${side}`}>
      <div className="evidence-heading">
        <h4>{title}</h4>
        <span>{side === 'baseline' ? 'Before' : 'After'}</span>
      </div>
      <pre
        className={value === null ? 'missing-value' : ''}
        tabIndex={0}
        aria-label={`${title} evidence`}
      >
        {preview}
      </pre>
      <div className="source-pointer">
        <span>Source pointer</span>
        <code tabIndex={0}>{pointer ?? 'No corresponding value'}</code>
        {pointer !== null && (
          <button
            type="button"
            className="text-button"
            onClick={() => onInspect({ side, pointer })}
          >
            Inspect source <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </section>
  );
}

export function FindingDetail({
  finding,
  onAccept,
  onReset,
  onInspect,
}: {
  finding: Finding;
  onAccept: (id: string, reason: string) => void;
  onReset: (id: string) => void;
  onInspect: (inspector: Inspector) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [finding.id]);
  return (
    <article className="finding-detail" aria-labelledby="finding-heading">
      <div className="detail-kicker">
        <span className={`severity severity-${finding.severity}`}>
          {finding.severity === 'error'
            ? 'Attention'
            : finding.severity === 'warning'
              ? 'Review'
              : 'Information'}
        </span>
        <span>{categoryLabels[finding.category] ?? finding.category}</span>
      </div>
      <h3 id="finding-heading" tabIndex={-1}>
        {finding.message}
      </h3>
      <code className="logical-path">{finding.path}</code>
      <div className="evidence-pair">
        <Evidence
          title="Baseline"
          side="baseline"
          value={finding.before}
          pointer={finding.pointers.baseline}
          onInspect={onInspect}
        />
        <Evidence
          title="Candidate"
          side="candidate"
          value={finding.after}
          pointer={finding.pointers.candidate}
          onInspect={onInspect}
        />
      </div>
      <div className="decision-box">
        {finding.accepted ? (
          <>
            <div className="decision-heading">
              <Icon name="check" />
              <strong>Accepted as an intentional change</strong>
            </div>
            <p className="decision-reason">{finding.accepted.reason}</p>
            <button
              type="button"
              className="button button-subtle"
              onClick={() => onReset(finding.id)}
            >
              Reopen this finding
            </button>
          </>
        ) : finding.category === 'coverage' ? (
          <>
            <div className="decision-heading">
              <Icon name="warning" />
              <strong>This check needs more evidence</strong>
            </div>
            <p>
              Coverage limitations cannot be accepted into a pass. Use the coverage details to
              identify the unsupported or uninspected structure.
            </p>
          </>
        ) : finding.severity === 'info' ? (
          <>
            <div className="decision-heading">
              <Icon name="file" />
              <strong>Recorded for your release review</strong>
            </div>
            <p>
              This information stays in exported evidence. It does not require an acceptance
              decision.
            </p>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim()) onAccept(finding.id, reason.trim());
            }}
          >
            <label htmlFor="decision-reason">Is this change intentional?</label>
            <p id="decision-help">
              Record why it is acceptable. The decision applies to these exact input files and
              comparison rules. Up to 2,000 characters.
            </p>
            <textarea
              id="decision-reason"
              rows={2}
              maxLength={2000}
              aria-describedby="decision-help"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: attribution was corrected against the archive’s catalog record."
            />
            <button className="button button-subtle" type="submit" disabled={!reason.trim()}>
              <Icon name="check" />
              Accept with reason
            </button>
          </form>
        )}
      </div>
      <p className="finding-code">
        Finding code <code>{finding.code}</code>
        <span title={finding.id}> · {finding.id.slice(0, 12)}</span>
      </p>
    </article>
  );
}
