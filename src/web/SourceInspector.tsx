import { useEffect, useRef } from 'react';
import type { AuditInput } from '../core/types';
import type { Inspector, Side } from './view-model';
import { Icon } from './ui';

export function SourceInspector({
  inspector,
  inputs,
  onClose,
}: {
  inspector: Inspector;
  inputs: Record<Side, AuditInput>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  let excerpt = '';
  try {
    const original = inputs[inspector.side].text;
    // JSON.parse does not accept the transport BOM. Remove it only from this
    // temporary view; original bytes/text and their evidence hashes stay intact.
    let value: unknown = JSON.parse(
      original.charCodeAt(0) === 0xfeff ? original.slice(1) : original,
    );
    for (const part of (inspector.pointer ?? '').split('/').slice(1)) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key))
        throw new Error('Pointer unavailable');
      value = (value as Record<string, unknown>)[key];
    }
    excerpt = JSON.stringify(value, null, 2);
    if (excerpt.length > 30000)
      excerpt = `${excerpt.slice(0, 30000)}\n\n[Preview limited to 30,000 characters. Original input is unchanged.]`;
  } catch {
    excerpt =
      'The precise source excerpt is unavailable. The finding still retains its original evidence and pointer.';
  }
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="source-dialog"
      onClose={onClose}
      aria-labelledby="source-dialog-title"
    >
      <div className="dialog-heading">
        <div>
          <p>{inspector.side === 'baseline' ? 'Baseline' : 'Candidate'} source</p>
          <h2 id="source-dialog-title">{inputs[inspector.side].name}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close source inspector"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <code className="dialog-pointer">{inspector.pointer || '(document root)'}</code>
      <pre>{excerpt}</pre>
      <p className="muted">
        Read-only excerpt from the original JSON. Text and URLs are displayed without executing or
        fetching them.
      </p>
    </dialog>
  );
}
