import { useMemo, useRef, useState } from 'react';
import { MAX_INPUT_BYTES } from '../core/index';
import type { AuditInput } from '../core/types';
import type { Side } from './view-model';
import { formatSize, readFile } from './files';
import { Icon } from './ui';

export function InputPanel({
  side,
  value,
  onChange,
  onError,
}: {
  side: Side;
  value: AuditInput;
  onChange: (value: AuditInput) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fileRequest = useRef(0);
  const byteCount = useMemo(() => new TextEncoder().encode(value.text).length, [value.text]);
  const label = side === 'baseline' ? 'Baseline' : 'Candidate';
  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    const currentRequest = ++fileRequest.current;
    try {
      const loaded = await readFile(file);
      if (currentRequest === fileRequest.current) onChange(loaded);
    } catch (error) {
      if (currentRequest === fileRequest.current) onError((error as Error).message);
    }
    if (input.current) input.current.value = '';
  };
  return (
    <section
      className={`input-panel ${dragging ? 'is-dragging' : ''}`}
      aria-labelledby={`${side}-heading`}
    >
      <div className="input-heading">
        <div className="input-title">
          <span className="side-marker">{side === 'baseline' ? '01' : '02'}</span>
          <div>
            <h2 id={`${side}-heading`}>{label}</h2>
            <p>
              {side === 'baseline'
                ? 'The collection as it exists today'
                : 'The proposed replacement'}
            </p>
          </div>
        </div>
        <div className="mode-switch" aria-label={`${label} input method`}>
          <button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}>
            File
          </button>
          <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>
            Paste
          </button>
        </div>
      </div>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept=".json,.jsonld,application/json,application/ld+json"
        aria-label={`Choose ${label.toLowerCase()} manifest`}
        tabIndex={-1}
        onChange={(event) => {
          void selectFile(event.target.files?.[0]);
        }}
      />
      {mode === 'file' ? (
        <div
          className="drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files.length > 1)
              onError(`Choose one ${label.toLowerCase()} manifest at a time.`);
            else void selectFile(event.dataTransfer.files[0]);
          }}
        >
          {value.text ? (
            <>
              <span className="file-symbol">
                <Icon name="file" size={24} />
              </span>
              <strong className="file-name">{value.name}</strong>
              <span className="file-meta">{formatSize(byteCount)} · Ready to compare</span>
              <button
                className="button button-subtle"
                type="button"
                onClick={() => input.current?.click()}
              >
                Replace file
              </button>
            </>
          ) : (
            <>
              <Icon name="upload" size={25} />
              <strong>Drop a manifest here</strong>
              <span>Presentation 2.1 or 3.0 · JSON · up to {formatSize(MAX_INPUT_BYTES)}</span>
              <button
                className="button button-subtle"
                type="button"
                onClick={() => input.current?.click()}
              >
                Choose {label.toLowerCase()} file
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="paste-area">
          <label className="visually-hidden" htmlFor={`${side}-json`}>
            {label} manifest JSON
          </label>
          <textarea
            id={`${side}-json`}
            value={value.text}
            placeholder={
              '{\n  "@context": "http://iiif.io/api/presentation/3/context.json",\n  "type": "Manifest",\n  …\n}'
            }
            spellCheck={false}
            onChange={(event) => {
              fileRequest.current += 1;
              onChange({ name: `${side}-pasted.json`, text: event.target.value });
            }}
          />
          <div className="paste-caption">
            <span>Paste the complete manifest JSON.</span>
            {value.text && (
              <button
                type="button"
                className="text-button"
                onClick={() => onChange({ name: '', text: '' })}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
