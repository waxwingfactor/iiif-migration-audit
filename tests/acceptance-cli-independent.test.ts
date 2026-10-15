import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  symlink,
  link,
  stat,
  truncate,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli/run';
import type { AuditReport } from '../src/core/types';
import type { BatchReport } from '../src/cli/types';
import { fetchSnapshot } from '../src/cli/snapshot';

// Independent operator-level tests: assertions concern saved evidence, exit codes,
// complete inventories and preservation of inputs rather than implementation helpers.
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function workspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'iiif-independent-cli-'));
  temporaryDirectories.push(path);
  return path;
}
function book(title = 'A book', host = 'https://images.example.test') {
  const canvasId = 'https://library.example.test/canvas/1';
  return {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: 'https://library.example.test/book',
    type: 'Manifest',
    label: { en: [title], fr: ['Un livre'] },
    items: [
      {
        id: canvasId,
        type: 'Canvas',
        label: { en: ['Page 1'] },
        width: 800,
        height: 1000,
        items: [
          {
            id: canvasId + '/page',
            type: 'AnnotationPage',
            items: [
              {
                id: canvasId + '/painting',
                type: 'Annotation',
                motivation: 'painting',
                target: canvasId,
                body: {
                  id: host + '/1.jpg',
                  type: 'Image',
                  format: 'image/jpeg',
                  width: 800,
                  height: 1000,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
async function invoke(cwd: string, args: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    cwd,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}
async function put(cwd: string, name: string, value: unknown): Promise<void> {
  await writeFile(join(cwd, name), JSON.stringify(value));
}
async function pairFiles(cwd: string): Promise<void> {
  await put(cwd, 'before.json', book());
  await put(cwd, 'after.json', book());
}
async function pairs(
  cwd: string,
  entries: { key: string; baseline: string; candidate: string }[],
): Promise<void> {
  await put(cwd, 'pairs.json', { schemaVersion: '1.0', pairs: entries });
}
// Parse the actual export, including quoted multiline fields. This does not share
// serialization code with the product under test.
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && char === '\r' && text[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index++;
    } else cell += char;
  }
  expect(quoted).toBe(false);
  expect(cell).toBe('');
  expect(row).toEqual([]);
  return rows;
}

describe('independent CLI input safety and accounting', () => {
  it.each(['baseline', 'candidate'] as const)(
    'protects a surviving %s even when its partner is missing',
    async (surviving) => {
      const cwd = await workspace();
      const original = JSON.stringify(book());
      await writeFile(join(cwd, 'surviving.json'), original);
      await pairs(cwd, [
        {
          key: 'broken',
          baseline: surviving === 'baseline' ? 'surviving.json' : 'missing.json',
          candidate: surviving === 'candidate' ? 'surviving.json' : 'missing.json',
        },
      ]);
      const result = await invoke(cwd, [
        'batch',
        'pairs.json',
        '--output',
        'surviving.json',
        '--force',
      ]);
      expect(result.code).toBe(4);
      expect(await readFile(join(cwd, 'surviving.json'), 'utf8')).toBe(original);
      expect(result.stderr).toContain('OUTPUT_IS_INPUT');
    },
  );

  it.each(['symlink', 'hardlink'] as const)(
    'protects a %s alias of a failed pair input',
    async (kind) => {
      const cwd = await workspace();
      const original = JSON.stringify(book());
      await writeFile(join(cwd, 'surviving.json'), original);
      if (kind === 'symlink') await symlink(join(cwd, 'surviving.json'), join(cwd, 'report.json'));
      else await link(join(cwd, 'surviving.json'), join(cwd, 'report.json'));
      await pairs(cwd, [{ key: 'broken', baseline: 'missing.json', candidate: 'surviving.json' }]);
      const result = await invoke(cwd, [
        'batch',
        'pairs.json',
        '--output',
        'report.json',
        '--force',
      ]);
      expect(result.code).toBe(4);
      expect(result.stderr).toContain('OUTPUT_IS_INPUT');
      expect(await readFile(join(cwd, 'report.json'), 'utf8')).toBe(original);
      expect(await readFile(join(cwd, 'surviving.json'), 'utf8')).toBe(original);
    },
  );

  it('protects a unique candidate in a duplicate-rejected pair', async () => {
    const cwd = await workspace();
    await pairFiles(cwd);
    const original = JSON.stringify(book('Another candidate'));
    await writeFile(join(cwd, 'other.json'), original);
    await pairs(cwd, [
      { key: 'first', baseline: 'before.json', candidate: 'after.json' },
      { key: 'duplicate-baseline', baseline: 'before.json', candidate: 'other.json' },
    ]);
    const result = await invoke(cwd, ['batch', 'pairs.json', '--output', 'other.json', '--force']);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain('OUTPUT_IS_INPUT');
    expect(await readFile(join(cwd, 'other.json'), 'utf8')).toBe(original);
  });

  it.each(['--help', '-h'])(
    'honors the positional delimiter for the filename %s',
    async (filename) => {
      const cwd = await workspace();
      await writeFile(join(cwd, filename), '{ malformed configuration');
      const result = await invoke(cwd, ['batch', '--', filename]);
      expect(result.code).toBe(4);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('PAIRS_JSON');
    },
  );

  it('retains pass, preservation failure, incomplete coverage and missing-file attempts together', async () => {
    const cwd = await workspace();
    const entries = [];
    for (const key of ['good', 'loss', 'extension', 'missing']) {
      await put(cwd, key + '-before.json', book());
      if (key !== 'missing') {
        const candidate = book();
        if (key === 'loss') candidate.items = [];
        await put(
          cwd,
          key + '-after.json',
          key === 'extension' ? { ...candidate, customExtension: 'unassessed' } : candidate,
        );
      }
      entries.push({ key, baseline: key + '-before.json', candidate: key + '-after.json' });
    }
    await pairs(cwd, entries);
    const result = await invoke(cwd, ['batch', 'pairs.json']);
    expect(result.code).toBe(4);
    const report = JSON.parse(result.stdout) as BatchReport;
    expect(report.summary).toMatchObject({
      requested: 4,
      processed: 4,
      passed: 1,
      failed: 1,
      incomplete: 1,
      errors: 1,
    });
    expect(report.pairs.map((entry) => entry.key)).toEqual([
      'good',
      'loss',
      'extension',
      'missing',
    ]);
    expect(report.pairs.map((entry) => entry.report?.status ?? 'error')).toEqual([
      'pass',
      'fail',
      'incomplete',
      'error',
    ]);
    expect(report.pairs[3]!.error?.code).toContain('ENOENT');
    for (const format of ['html', 'csv']) {
      const exported = await invoke(cwd, ['batch', 'pairs.json', '--format', format]);
      expect(exported.code).toBe(4);
      for (const pair of report.pairs) {
        expect(exported.stdout).toContain(pair.key);
        if (pair.report)
          for (const finding of pair.report.findings) expect(exported.stdout).toContain(finding.id);
        else expect(exported.stdout).toContain(pair.error!.code);
      }
      if (format === 'csv') {
        const rows = csvRows(exported.stdout);
        expect(rows.every((row) => row.length === rows[0]!.length)).toBe(true);
      }
    }
  });

  it('discovers a candidate-only file in a nested inventory and rejects directory symlinks', async () => {
    const cwd = await workspace();
    await mkdir(join(cwd, 'baseline'));
    await mkdir(join(cwd, 'candidate/nested'), { recursive: true });
    await put(cwd, 'baseline/book.json', book());
    await put(cwd, 'candidate/book.json', book());
    await put(cwd, 'candidate/nested/forgotten.JSON', book('Unpaired candidate'));
    await pairs(cwd, [
      { key: 'book', baseline: 'baseline/book.json', candidate: 'candidate/book.json' },
    ]);
    const args = [
      'batch',
      'pairs.json',
      '--baseline-dir',
      'baseline',
      '--candidate-dir',
      'candidate',
    ];
    const result = await invoke(cwd, args);
    expect(result.code).toBe(3);
    const report = JSON.parse(result.stdout) as BatchReport;
    expect(report.summary).toMatchObject({ processed: 1, passed: 1, issues: 1 });
    expect(report.issues[0]).toMatchObject({ code: 'UNPAIRED_INPUT' });
    expect(report.issues[0]!.message).toContain('nested/forgotten.JSON');
    await symlink(join(cwd, 'baseline'), join(cwd, 'candidate/alias'));
    const linked = await invoke(cwd, args);
    expect(linked.code).toBe(4);
    expect(
      (JSON.parse(linked.stdout) as BatchReport).issues.some(
        (issue) => issue.code === 'INVENTORY_SYMLINK',
      ),
    ).toBe(true);
  });

  it('rejects malformed UTF-8 and lossy numeric input without emitting a stale success', async () => {
    const cwd = await workspace();
    await pairFiles(cwd);
    await writeFile(join(cwd, 'after.json'), Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]));
    const encoding = await invoke(cwd, ['compare', 'before.json', 'after.json']);
    expect(encoding.code).toBe(4);
    expect(encoding.stdout).toBe('');
    expect(encoding.stderr).toContain('INPUT_ENCODING');
    await writeFile(
      join(cwd, 'after.json'),
      JSON.stringify(book()).replace('"width":800', '"width":9007199254740993'),
    );
    const precision = await invoke(cwd, ['compare', 'before.json', 'after.json']);
    expect(precision.code).toBe(4);
    expect(precision.stdout).toBe('');
    expect(precision.stderr).toMatch(/NUMBER|precision|numeric/iu);
  });

  it('retains original BOM bytes in the snapshot identity and writes private report files', async () => {
    const cwd = await workspace();
    const text = '\uFEFF' + JSON.stringify(book()) + '\r\n';
    await writeFile(join(cwd, 'before.json'), text);
    await writeFile(join(cwd, 'after.json'), text);
    const result = await invoke(cwd, [
      'compare',
      'before.json',
      'after.json',
      '--output',
      'nested/report.json',
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    const report = JSON.parse(
      await readFile(join(cwd, 'nested/report.json'), 'utf8'),
    ) as AuditReport;
    expect(report.baseline.sha256).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    if (process.platform !== 'win32')
      expect((await stat(join(cwd, 'nested/report.json'))).mode & 0o777).toBe(0o600);
  });

  it('rejects a file above the documented byte budget before attempting JSON parsing', async () => {
    const cwd = await workspace();
    await pairFiles(cwd);
    await truncate(join(cwd, 'after.json'), 20 * 1024 * 1024 + 1);
    const result = await invoke(cwd, ['compare', 'before.json', 'after.json']);
    expect(result.code).toBe(4);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('INPUT_TOO_LARGE');
  });
});

describe('independent CLI policy and export acceptance', () => {
  it('keeps URI authorization scoped and preserves policy/pairing evidence in every format', async () => {
    const cwd = await workspace();
    await put(cwd, 'before.json', book());
    await put(cwd, 'after.json', book('A book', 'https://new-images.example.test'));
    const policy = {
      schemaVersion: '1.0',
      uriRules: [
        {
          scope: 'image',
          fromPrefix: 'https://images.example.test',
          toPrefix: 'https://new-images.example.test',
        },
      ],
      acceptedChanges: [],
    };
    await put(cwd, 'policy.json', policy);
    const args = ['compare', 'before.json', 'after.json', '--policy', 'policy.json'];
    const json = await invoke(cwd, args);
    expect(json.code).toBe(0);
    const report = JSON.parse(json.stdout) as AuditReport;
    const csv = await invoke(cwd, [...args, '--format', 'csv']);
    const html = await invoke(cwd, [...args, '--format', 'html']);
    expect(csv.code).toBe(0);
    expect(html.code).toBe(0);
    const rows = csvRows(csv.stdout);
    const cells = rows.flat();
    expect(cells).toContain(JSON.stringify(report.policy));
    for (const key of [
      'schemaVersion',
      'toolVersion',
      'profileVersion',
      'fingerprintVersion',
    ] as const)
      expect(
        rows.some(
          (row) => row[0] === 'reproducibility' && row.includes(key) && row.includes(report[key]),
        ),
      ).toBe(true);
    expect(cells).toContain(report.baseline.sha256);
    expect(cells).toContain(report.canvasPairs[0]!.baselineId);
    expect(html.stdout).toContain('https://images.example.test');
    expect(html.stdout).toContain(report.canvasPairs[0]!.baselineId);
    const candidate = book('A book', 'https://new-images.example.test');
    candidate.items[0]!.id = 'https://changed.example.test/canvas/1';
    await put(cwd, 'after.json', candidate);
    expect((await invoke(cwd, args)).code).not.toBe(0);
  });

  it('retains exact findings, acceptance reasons and unassessed coverage in JSON/CSV/HTML', async () => {
    const cwd = await workspace();
    await put(cwd, 'before.json', book());
    const attack =
      '</pre><img src="https://never-fetch.invalid/pixel" onerror="alert(1)">\nSecond line';
    await put(cwd, 'after.json', { ...book(attack), customExtension: 'unassessed' });
    const first = JSON.parse(
      (await invoke(cwd, ['compare', 'before.json', 'after.json'])).stdout,
    ) as AuditReport;
    const reason =
      '=HYPERLINK("https://never-fetch.invalid", "approved")\nInstitutional correction';
    await put(cwd, 'policy.json', {
      schemaVersion: '1.0',
      uriRules: [],
      acceptedChanges: first.findings.map((finding) => ({ findingId: finding.id, reason })),
    });
    const args = ['compare', 'before.json', 'after.json', '--policy', 'policy.json'];
    const json = await invoke(cwd, args);
    const report = JSON.parse(json.stdout) as AuditReport;
    expect(json.code).toBe(3);
    expect(report.summary.accepted).toBe(first.findings.length);
    const csv = await invoke(cwd, [...args, '--format', 'csv']);
    const html = await invoke(cwd, [...args, '--format', 'html']);
    expect(csv.code).toBe(3);
    expect(html.code).toBe(3);
    const rows = csvRows(csv.stdout);
    expect(rows.every((row) => row.length === rows[0]!.length)).toBe(true);
    const header = rows[0]!;
    for (const finding of report.findings) {
      const row = rows.find(
        (entry) => entry[0] === 'finding' && entry[header.indexOf('id')] === finding.id,
      )!;
      expect(row).toBeDefined();
      expect(row[header.indexOf('before_json')]).toBe(JSON.stringify(finding.before));
      expect(row[header.indexOf('after_json')]).toBe(JSON.stringify(finding.after));
      expect(row[header.indexOf('accepted_reason')]).toBe("'" + reason);
      expect(html.stdout).toContain(finding.id);
    }
    for (const notice of report.coverage) {
      expect(
        rows.some((row) => row[0] === 'coverage' && row[header.indexOf('path')] === notice.pointer),
      ).toBe(true);
      expect(html.stdout).toContain(notice.pointer);
    }
    expect(html.stdout).not.toMatch(/<(?:img|script|iframe|link)\b/iu);
    expect(html.stdout).toContain('&lt;img');
    expect(html.stdout).toContain("default-src 'none'");
  });

  it('keeps corpus approvals current only while their exact pair evidence remains unchanged', async () => {
    const cwd = await workspace();
    await pairFiles(cwd);
    await put(cwd, 'after.json', book('Corrected title'));
    await put(cwd, 'second-before.json', book());
    await put(cwd, 'second-after.json', book());
    await pairs(cwd, [
      { key: 'edited', baseline: 'before.json', candidate: 'after.json' },
      { key: 'untouched', baseline: 'second-before.json', candidate: 'second-after.json' },
    ]);
    const first = JSON.parse((await invoke(cwd, ['batch', 'pairs.json'])).stdout) as BatchReport;
    const acceptedChanges = first.pairs[0]!.report!.findings.map((finding) => ({
      findingId: finding.id,
      reason: 'Verified title correction',
    }));
    await put(cwd, 'policy.json', { schemaVersion: '1.0', uriRules: [], acceptedChanges });
    const args = ['batch', 'pairs.json', '--policy', 'policy.json'];
    const accepted = await invoke(cwd, args);
    expect(accepted.code).toBe(0);
    const acceptedReport = JSON.parse(accepted.stdout) as BatchReport;
    const csv = await invoke(cwd, [...args, '--format', 'csv']);
    expect(csv.code).toBe(0);
    const rows = csvRows(csv.stdout);
    const header = rows[0]!;
    for (const pair of acceptedReport.pairs) {
      const pairRows = rows.filter((row) => row[header.indexOf('pair_key')] === pair.key);
      expect(pairRows.flat()).toContain(JSON.stringify(pair.report!.policy));
      expect(pairRows.flat()).toContain(pair.report!.canvasPairs[0]!.baselineId);
      for (const finding of pair.report!.findings) expect(pairRows.flat()).toContain(finding.id);
    }
    const original = await readFile(join(cwd, 'after.json'), 'utf8');
    await writeFile(join(cwd, 'after.json'), original + '\n');
    const stale = await invoke(cwd, args);
    expect(stale.code).toBe(3);
    const report = JSON.parse(stale.stdout) as BatchReport;
    expect(report.issues.filter((issue) => issue.code === 'STALE_APPROVAL')).toHaveLength(
      acceptedChanges.length,
    );
    expect(report.pairs[0]!.report!.findings.every((finding) => finding.accepted === null)).toBe(
      true,
    );
    expect(report.pairs[1]!.report!.status).toBe('pass');
  });
});

describe('independent explicit snapshot bounds', () => {
  it('bounds the decompressed bytes of a real compressed HTTP response', async () => {
    const compressed = gzipSync('{"large":"' + 'x'.repeat(4096) + '"}');
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': compressed.length,
      });
      response.end(compressed);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No staging test address');
      expect(compressed.length).toBeLessThan(256);
      await expect(
        fetchSnapshot('http://127.0.0.1:' + address.port + '/manifest', {
          presentation: '3',
          maximumBytes: 256,
        }),
      ).rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
  it('counts streamed bytes rather than trusting a small Content-Length', async () => {
    const fetcher = (async () =>
      new Response('{"long":"' + 'x'.repeat(100) + '"}', {
        headers: { 'content-length': '1' },
      })) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.test/manifest', {
        presentation: '3',
        maximumBytes: 40,
        fetch: fetcher,
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_TOO_LARGE' });
  });

  it('decodes split UTF-8 chunks exactly and rejects malformed bytes before saving', async () => {
    const bytes = Buffer.from('\uFEFF{"label":"é𐐷"}\r\n');
    const fetcher = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
      )) as typeof fetch;
    const result = await fetchSnapshot('https://example.test/manifest', {
      presentation: '2',
      maximumBytes: 100,
      fetch: fetcher,
    });
    expect(result.text).toBe(bytes.toString('utf8'));
    expect(result.bytes).toBe(bytes.length);
    const invalid = (async () => new Response(Uint8Array.from([0x7b, 0xc3, 0x7d]))) as typeof fetch;
    await expect(
      fetchSnapshot('https://example.test/manifest', {
        presentation: '3',
        maximumBytes: 100,
        fetch: invalid,
      }),
    ).rejects.toMatchObject({ code: 'SNAPSHOT_ENCODING' });
  });
});
