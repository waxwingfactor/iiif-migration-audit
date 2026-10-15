import { useEffect, useRef, useState } from 'react';
import { parsePolicy } from '../core/index';
import type { AcceptedChange, AuditPolicy, UriScope } from '../core/types';
import { saveFile, readFile } from './files';
import { Icon, Pagination } from './ui';

const scopes: UriScope[] = ['manifest', 'canvas', 'range', 'image', 'image-service', 'link'];

export function PolicyPanel({
  policy,
  onChange,
  onError,
  decisions,
  getResetVersion,
}: {
  policy: AuditPolicy;
  onChange: (policy: AuditPolicy) => void;
  onError: (message: string) => void;
  decisions: AcceptedChange[];
  getResetVersion: () => number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const importRequest = useRef(0);
  const [savedPage, setSavedPage] = useState(0);
  useEffect(() => setSavedPage(0), [decisions.length]);
  const commitPolicy = (next: AuditPolicy) => {
    importRequest.current += 1;
    onChange(next);
  };
  const updateRule = (index: number, field: 'scope' | 'fromPrefix' | 'toPrefix', value: string) =>
    commitPolicy({
      ...policy,
      uriRules: policy.uriRules.map((rule, i) =>
        i === index ? { ...rule, [field]: value } : rule,
      ),
    });
  const exportPolicy = () => {
    try {
      const validated = parsePolicy(JSON.stringify({ ...policy, acceptedChanges: decisions }));
      saveFile(JSON.stringify(validated, null, 2), 'iiif-audit-policy.json', 'application/json');
    } catch (error) {
      onError(
        `Complete or remove invalid policy entries before exporting: ${(error as Error).message}`,
      );
    }
  };
  return (
    <section className="policy-panel" aria-labelledby="policy-title">
      <div className="section-title-row">
        <div>
          <h2 id="policy-title">Comparison policy</h2>
          <p>Explicit URL rules and evidence-bound review decisions.</p>
        </div>
        <div className="button-group">
          <button
            type="button"
            className="button button-subtle"
            onClick={() => fileInput.current?.click()}
          >
            Import policy
          </button>
          <button type="button" className="button button-subtle" onClick={exportPolicy}>
            Export policy
          </button>
        </div>
      </div>
      <input
        ref={fileInput}
        className="visually-hidden"
        tabIndex={-1}
        type="file"
        accept=".json,application/json"
        aria-label="Import comparison policy"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const currentRequest = ++importRequest.current;
          const resetAtStart = getResetVersion();
          const isCurrent = () =>
            currentRequest === importRequest.current && resetAtStart === getResetVersion();
          try {
            const input = await readFile(file);
            const parsed = parsePolicy(input.text);
            if (isCurrent()) commitPolicy(parsed);
          } catch (error) {
            if (isCurrent()) onError((error as Error).message);
          }
          event.target.value = '';
        }}
      />
      <div className="policy-note">
        <Icon name="shield" />
        <p>
          Rules match HTTP(S) host or path prefixes at a complete boundary. Each rule applies only
          to its selected role. Image-service rules cannot approve changes to Canvas IDs used by
          external annotations.
        </p>
      </div>
      {policy.uriRules.length === 0 ? (
        <p className="policy-empty">
          No URL rewrites. Resources will be paired by their exact identities.
        </p>
      ) : (
        <div className="rules-list">
          {policy.uriRules.map((rule, index) => (
            <div className="rule-row" key={index}>
              <label>
                Role
                <select
                  value={rule.scope}
                  onChange={(event) => updateRule(index, 'scope', event.target.value)}
                >
                  {scopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope === 'image-service'
                        ? 'Image service'
                        : scope === 'image'
                          ? 'Image body'
                          : scope[0]?.toUpperCase() + scope.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Baseline prefix
                <input
                  value={rule.fromPrefix}
                  onChange={(event) => updateRule(index, 'fromPrefix', event.target.value)}
                  placeholder="https://old.example/images/"
                  spellCheck={false}
                />
              </label>
              <span className="rule-arrow">
                <Icon name="arrow" />
              </span>
              <label>
                Candidate prefix
                <input
                  value={rule.toPrefix}
                  onChange={(event) => updateRule(index, 'toPrefix', event.target.value)}
                  placeholder="https://new.example/images/"
                  spellCheck={false}
                />
              </label>
              <button
                type="button"
                className="icon-button remove-rule"
                aria-label={`Remove URL rule ${index + 1}`}
                onClick={() =>
                  commitPolicy({
                    ...policy,
                    uriRules: policy.uriRules.filter((_, i) => i !== index),
                  })
                }
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="policy-footer">
        <button
          type="button"
          className="text-button"
          onClick={() =>
            commitPolicy({
              ...policy,
              uriRules: [
                ...policy.uriRules,
                { scope: 'image-service', fromPrefix: '', toPrefix: '' },
              ],
            })
          }
        >
          + Add URL rule
        </button>
        <span>
          {decisions.length} review {decisions.length === 1 ? 'decision' : 'decisions'} in this tab
          · Changing inputs or rules invalidates affected approvals.
        </span>
      </div>
      {decisions.length > 0 && (
        <details className="saved-decisions">
          <summary>Inspect or remove decisions ({decisions.length})</summary>
          <p>
            Remove a stale decision here, then compare again. The original evidence stays in the
            input files.
          </p>
          <ul>
            {decisions.slice(savedPage * 100, (savedPage + 1) * 100).map((decision) => (
              <li key={decision.findingId}>
                <div>
                  <code>{decision.findingId}</code>
                  <p>{decision.reason}</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Remove saved decision ${decision.findingId.slice(0, 12)}`}
                  onClick={() =>
                    commitPolicy({
                      ...policy,
                      acceptedChanges: decisions.filter(
                        (entry) => entry.findingId !== decision.findingId,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <Pagination
            label="Saved decision pages"
            total={decisions.length}
            page={savedPage}
            onChange={setSavedPage}
          />
        </details>
      )}
    </section>
  );
}
