import { MAX_INPUT_BYTES } from '../core/index';
import type { AuditInput } from '../core/types';

export function formatSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} bytes`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function saveFile(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readFile(file: File): Promise<AuditInput> {
  if (file.size > MAX_INPUT_BYTES)
    throw new Error(
      `This file is ${formatSize(file.size)}. Choose a manifest under ${formatSize(MAX_INPUT_BYTES)}.`,
    );
  try {
    // Preserve a UTF-8 BOM in the input text so browser/CLI evidence hashes agree.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.arrayBuffer(),
    );
    return { name: file.name, text };
  } catch {
    throw new Error(
      'This file could not be read as UTF-8 text. Export the manifest as UTF-8 JSON and try again.',
    );
  }
}
