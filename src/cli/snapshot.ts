import { CliError } from './io';

export interface SnapshotOptions {
  presentation: '2' | '3';
  maximumBytes: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}
export interface SnapshotResult {
  text: string;
  finalUrl: string;
  presentation: '2' | '3';
  bytes: number;
}

function safeUrl(value: string): URL {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError('SNAPSHOT_URL', 'Provide an absolute HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new CliError(
      'SNAPSHOT_URL',
      'Snapshot URLs must use HTTP(S), without credentials or fragments.',
    );
  return url;
}

/** Only this explicitly invoked command performs network I/O. Linked resources are untouched. */
export async function fetchSnapshot(
  value: string,
  options: SnapshotOptions,
): Promise<SnapshotResult> {
  let url = safeUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  timer.unref();
  const fetcher = options.fetch ?? fetch;
  try {
    for (let redirect = 0; redirect <= 5; redirect++) {
      const response = await fetcher(url, {
        redirect: 'manual',
        signal: controller.signal,
        credentials: 'omit',
        headers: {
          Accept:
            'application/ld+json;profile="http://iiif.io/api/presentation/' +
            options.presentation +
            '/context.json", application/json;q=0.9',
          'User-Agent': 'IIIF-Migration-Audit snapshot',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirect === 5)
          throw new CliError(
            'SNAPSHOT_REDIRECT',
            'Snapshot redirect chain is missing a destination or exceeds five redirects.',
          );
        const next = safeUrl(new URL(location, url).href);
        if (url.protocol === 'https:' && next.protocol !== 'https:')
          throw new CliError('SNAPSHOT_DOWNGRADE', 'Refusing an HTTPS-to-HTTP redirect.');
        url = next;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new CliError(
          'SNAPSHOT_HTTP',
          'Snapshot request returned HTTP ' + response.status + '.',
        );
      }
      const declared = response.headers.get('content-length');
      if (declared && Number(declared) > options.maximumBytes) {
        await response.body?.cancel();
        throw new CliError(
          'SNAPSHOT_TOO_LARGE',
          'Snapshot response exceeds the ' + options.maximumBytes + '-byte limit.',
        );
      }
      if (!response.body) throw new CliError('SNAPSHOT_EMPTY', 'Snapshot response has no body.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          if (bytes > options.maximumBytes)
            throw new CliError(
              'SNAPSHOT_TOO_LARGE',
              'Snapshot response exceeds the ' + options.maximumBytes + '-byte limit.',
            );
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body);
      } catch {
        throw new CliError('SNAPSHOT_ENCODING', 'Snapshot response is not valid UTF-8 JSON.');
      }
      // Do not normalize or reserialize: approvals must bind to the exact saved snapshot.
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      } catch {
        throw new CliError(
          'SNAPSHOT_JSON',
          'Snapshot response is not a JSON object. No output was saved.',
        );
      }
      return { text, finalUrl: url.href, presentation: options.presentation, bytes };
    }
    throw new CliError('SNAPSHOT_REDIRECT', 'Snapshot redirect limit exceeded.');
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (controller.signal.aborted)
      throw new CliError('SNAPSHOT_TIMEOUT', 'Snapshot request exceeded its time limit.');
    throw new CliError(
      'SNAPSHOT_NETWORK',
      'Snapshot request failed. Check the URL, network and server certificate.',
    );
  } finally {
    clearTimeout(timer);
  }
}
