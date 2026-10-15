import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readTextFile, writeOutput } from '../src/cli/io';
import { fetchSnapshot } from '../src/cli/snapshot';

const directories: string[] = [];
async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'iiif-audit-io-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('bounded I/O and explicit snapshot network command', () => {
  it('preserves a UTF-8 BOM in local and remote evidence without reformatting', async () => {
    const cwd = await workspace();
    const text = '\uFEFF{ "id": "https://example.org/legacy" }\r\n';
    await writeFile(join(cwd, 'bom.json'), text);
    expect(await readTextFile(join(cwd, 'bom.json'), 1000)).toBe(text);
    const remote = (async () => new Response(text)) as typeof fetch;
    const snapshot = await fetchSnapshot('https://example.org/bom', {
      presentation: '2',
      maximumBytes: 1000,
      fetch: remote,
    });
    expect(snapshot.text).toBe(text);
    expect(snapshot.bytes).toBe(Buffer.byteLength(text, 'utf8'));
  });
  it('retrieves one real local staging response with content negotiation and no credentials', async () => {
    const requests: {
      accept: string | undefined;
      cookie: string | undefined;
      authorization: string | undefined;
    }[] = [];
    const text = '{ "id": "https://example.org/snapshot" }\n';
    const server = createServer((request, response) => {
      requests.push({
        accept: request.headers.accept,
        cookie: request.headers.cookie,
        authorization: request.headers.authorization,
      });
      response.setHeader('Content-Type', 'application/json');
      response.end(text);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test server address');
      const result = await fetchSnapshot('http://127.0.0.1:' + address.port + '/manifest', {
        presentation: '3',
        maximumBytes: 4096,
      });
      expect(result.text).toBe(text);
      expect(requests).toHaveLength(1);
      expect(requests[0]!.accept).toContain('/presentation/3/context.json');
      expect(requests[0]!.cookie).toBeUndefined();
      expect(requests[0]!.authorization).toBeUndefined();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it('stops a stalled body at its total time limit', async () => {
    const stalled = (async (_url: string | URL | Request, options?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            options?.signal?.addEventListener('abort', () =>
              controller.error(new Error('aborted')),
            );
          },
        }),
      )) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.org/stalled', {
        presentation: '3',
        maximumBytes: 100,
        timeoutMs: 15,
        fetch: stalled,
      }),
    ).rejects.toThrow(/time limit/u);
  });

  it('bounds redirects and rejects credentials introduced by a redirect', async () => {
    let requests = 0;
    const loop = (async () => {
      requests++;
      return new Response(null, { status: 302, headers: { location: '/again' } });
    }) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.org/loop', {
        presentation: '3',
        maximumBytes: 100,
        fetch: loop,
      }),
    ).rejects.toThrow(/five redirects/u);
    expect(requests).toBe(6);
    const credentials = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://user:secret@example.org/private' },
      })) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.org/redirect', {
        presentation: '3',
        maximumBytes: 100,
        fetch: credentials,
      }),
    ).rejects.toThrow(/credentials/u);
  });
  it('rejects over-budget and invalid-UTF8 local inputs', async () => {
    const cwd = await workspace();
    const path = join(cwd, 'data.json');
    await writeFile(path, '12345');
    await expect(readTextFile(path, 4)).rejects.toThrow(/limit/u);
    await writeFile(path, Buffer.from([0xff]));
    await expect(readTextFile(path, 10)).rejects.toThrow(/UTF-8/u);
    await expect(writeOutput(path, 'new', [path], true)).rejects.toThrow(/overwrite/u);
  });

  it('sends requested content negotiation, preserves exact bytes and never follows linked URLs', async () => {
    const calls: { url: string; accept: string }[] = [];
    const text = '{\n "id": "https://example.org/book", "seeAlso": "https://never-fetch.test"\n}\n';
    const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({ url: String(url), accept: new Headers(options?.headers).get('accept') ?? '' });
      return new Response(text, { status: 200 });
    }) as typeof fetch;
    const result = await fetchSnapshot('https://example.org/manifest', {
      presentation: '2',
      maximumBytes: 4096,
      fetch: fetcher,
    });
    expect(result.text).toBe(text);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.accept).toContain('/presentation/2/context.json');
  });

  it('rejects credentials, unsafe schemes, redirect downgrades and large responses', async () => {
    const never = (async () => {
      throw new Error('Should not fetch');
    }) as typeof fetch;
    for (const url of [
      'file:///etc/passwd',
      'data:application/json,{}',
      'https://user:secret@example.org/x',
    ])
      await expect(
        fetchSnapshot(url, { presentation: '3', maximumBytes: 4, fetch: never }),
      ).rejects.toThrow(/HTTP/u);
    const redirect = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://example.org/x' },
      })) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.org/x', {
        presentation: '3',
        maximumBytes: 4,
        fetch: redirect,
      }),
    ).rejects.toThrow(/HTTPS-to-HTTP/u);
    const large = (async () => new Response('{"large":"payload"}')) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.org/x', { presentation: '3', maximumBytes: 4, fetch: large }),
    ).rejects.toThrow(/limit/u);
    const html = (async () => new Response('<!doctype html>Not JSON')) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.org/x', { presentation: '3', maximumBytes: 100, fetch: html }),
    ).rejects.toThrow(/JSON/u);
  });
});
