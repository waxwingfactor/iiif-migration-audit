import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli/run';
import { parsePairs, runBatch } from '../src/cli/batch';
import type { AuditReport } from '../src/core/types';
import type { BatchReport } from '../src/cli/types';

const directories: string[] = [];
async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'iiif-audit-cli-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function manifest(label = 'A book', pages = 2): string {
  return JSON.stringify({
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: 'https://example.org/book',
    type: 'Manifest',
    label: { en: [label] },
    items: Array.from({ length: pages }, (_, index) => {
      const id = 'https://example.org/canvas/' + index;
      return {
        id,
        type: 'Canvas',
        label: { en: ['Page ' + (index + 1)] },
        width: 1000,
        height: 1500,
        items: [
          {
            id: id + '/page',
            type: 'AnnotationPage',
            items: [
              {
                id: id + '/painting',
                type: 'Annotation',
                motivation: 'painting',
                target: id,
                body: {
                  id: 'https://example.org/image/' + index + '.jpg',
                  type: 'Image',
                  format: 'image/jpeg',
                  width: 1000,
                  height: 1500,
                },
              },
            ],
          },
        ],
      };
    }),
  });
}
async function invoke(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}
async function files(cwd: string): Promise<void> {
  await writeFile(join(cwd, 'before.json'), manifest());
  await writeFile(join(cwd, 'after.json'), manifest());
}

describe('CLI local workflow', () => {
  it('shows usable help and version, and rejects invalid options', async () => {
    const cwd = await workspace();
    expect((await invoke(['--help'], cwd)).stdout).toContain('iiif-audit batch');
    expect((await invoke(['--version'], cwd)).stdout).toMatch(/^\d+\.\d+\.\d+\n$/u);
    expect((await invoke(['compare', 'a', 'b', '--unknown', 'x'], cwd)).code).toBe(4);
    expect(
      (
        await invoke(
          ['snapshot', 'https://example.org', '--presentation', '4', '--output', 'snapshot.json'],
          cwd,
        )
      ).code,
    ).toBe(4);
    expect((await invoke(['compare', 'a', 'b', '--format', 'xml'], cwd)).code).toBe(4);
    expect((await invoke(['constructor', 'pairs.json'], cwd)).stderr).toContain('ARGUMENT_COMMAND');
  });

  it('compares real local files and leaves stdout as parseable report JSON', async () => {
    const cwd = await workspace();
    await files(cwd);
    const result = await invoke(['compare', 'before.json', 'after.json'], cwd);
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as AuditReport;
    expect(report.status).toBe('pass');
    expect(report.baseline.name).toBe('before.json');
    expect(report.baseline.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.stdout).not.toContain(cwd);
    expect(result.stderr).toContain('pass:');
    expect(await readFile(join(cwd, 'before.json'), 'utf8')).toBe(manifest());
  });

  it('exports standalone HTML and CSV with the same preservation findings', async () => {
    const cwd = await workspace();
    await files(cwd);
    await writeFile(join(cwd, 'after.json'), manifest('A book', 1));
    const json = await invoke(['compare', 'before.json', 'after.json'], cwd);
    expect(json.code).toBe(2);
    const report = JSON.parse(json.stdout) as AuditReport;
    const html = await invoke(
      [
        'compare',
        'before.json',
        'after.json',
        '--format',
        'html',
        '--output',
        'reports/audit.html',
      ],
      cwd,
    );
    expect(html.code).toBe(2);
    expect(html.stdout).toBe('');
    const saved = await readFile(join(cwd, 'reports/audit.html'), 'utf8');
    expect(saved).toContain('<!doctype html>');
    expect(saved).toContain(report.findings[0]!.id);
    const csv = await invoke(['compare', 'before.json', 'after.json', '--format', 'csv'], cwd);
    expect(csv.code).toBe(2);
    expect(csv.stdout).toContain(report.findings[0]!.id);
  });

  it('uses reasoned decisions and invalidates them after an input change', async () => {
    const cwd = await workspace();
    await files(cwd);
    await writeFile(join(cwd, 'after.json'), manifest('A revised title'));
    const first = JSON.parse(
      (await invoke(['compare', 'before.json', 'after.json'], cwd)).stdout,
    ) as AuditReport;
    expect(first.findings.length).toBeGreaterThan(0);
    const policy = {
      schemaVersion: '1.0',
      uriRules: [],
      acceptedChanges: first.findings.map((finding) => ({
        findingId: finding.id,
        reason: 'Intentional editorial correction',
      })),
    };
    await writeFile(join(cwd, 'policy.json'), JSON.stringify(policy));
    const reviewed = await invoke(
      ['compare', 'before.json', 'after.json', '--policy', 'policy.json'],
      cwd,
    );
    expect(reviewed.code).toBe(0);
    expect(
      (JSON.parse(reviewed.stdout) as AuditReport).findings.every((finding) => finding.accepted),
    ).toBe(true);
    await writeFile(join(cwd, 'after.json'), manifest('A different title'));
    expect(
      (await invoke(['compare', 'before.json', 'after.json', '--policy', 'policy.json'], cwd)).code,
    ).toBe(3);
  });

  it('returns input error without stale report output for malformed or missing files', async () => {
    const cwd = await workspace();
    await files(cwd);
    await writeFile(join(cwd, 'after.json'), '{not-json');
    const invalid = await invoke(['compare', 'before.json', 'after.json'], cwd);
    expect(invalid.code).toBe(4);
    expect(invalid.stdout).toBe('');
    const absent = await invoke(['compare', 'missing.json', 'before.json'], cwd);
    expect(absent.code).toBe(4);
    expect(absent.stderr).toContain('ENOENT');
    expect(absent.stderr).not.toContain(cwd);
  });

  it('refuses input overwrites, aliases, and accidental prior-report overwrites', async () => {
    const cwd = await workspace();
    await files(cwd);
    expect(
      (
        await invoke(
          ['compare', 'before.json', 'after.json', '--output', 'before.json', '--force'],
          cwd,
        )
      ).code,
    ).toBe(4);
    await link(join(cwd, 'before.json'), join(cwd, 'alias.json'));
    expect(
      (
        await invoke(
          ['compare', 'before.json', 'after.json', '--output', 'alias.json', '--force'],
          cwd,
        )
      ).code,
    ).toBe(4);
    await symlink(join(cwd, 'before.json'), join(cwd, 'alias-link.json'));
    expect(
      (
        await invoke(
          ['compare', 'before.json', 'after.json', '--output', 'alias-link.json', '--force'],
          cwd,
        )
      ).code,
    ).toBe(4);
    expect(
      (await invoke(['compare', 'before.json', 'after.json', '--output', 'report.json'], cwd)).code,
    ).toBe(0);
    expect(
      (await invoke(['compare', 'before.json', 'after.json', '--output', 'report.json'], cwd)).code,
    ).toBe(4);
    expect(
      (
        await invoke(
          ['compare', 'before.json', 'after.json', '--output', 'report.json', '--force'],
          cwd,
        )
      ).code,
    ).toBe(0);
    expect(await readFile(join(cwd, 'before.json'), 'utf8')).toBe(manifest());
  });
});

describe('batch accounting and path boundaries', () => {
  it('bounds expanded report retention and accounts explicitly for skipped pairs', async () => {
    const cwd = await workspace();
    await files(cwd);
    await writeFile(join(cwd, 'other-before.json'), manifest('Other'));
    await writeFile(join(cwd, 'other-after.json'), manifest('Other'));
    await writeFile(
      join(cwd, 'pairs.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        pairs: [
          { key: 'first', baseline: 'before.json', candidate: 'after.json' },
          { key: 'second', baseline: 'other-before.json', candidate: 'other-after.json' },
        ],
      }),
    );
    const result = await runBatch(join(cwd, 'pairs.json'), {
      policy: { schemaVersion: '1.0', uriRules: [], acceptedChanges: [] },
      reportByteLimit: 1,
    });
    expect(result.report.status).toBe('error');
    expect(result.report.summary.processed).toBe(2);
    expect(result.report.summary.errors).toBe(2);
    expect(
      result.report.pairs.every(
        (pair) => pair.report === null && pair.error?.code === 'BATCH_REPORT_LIMIT',
      ),
    ).toBe(true);
  });
  it('keeps every requested pair when one file is missing', async () => {
    const cwd = await workspace();
    await files(cwd);
    await writeFile(
      join(cwd, 'pairs.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        pairs: [
          { key: 'good', baseline: 'before.json', candidate: 'after.json' },
          { key: 'bad', baseline: 'missing.json', candidate: 'after.json' },
        ],
      }),
    );
    const result = await invoke(['batch', 'pairs.json'], cwd);
    expect(result.code).toBe(4);
    const batch = JSON.parse(result.stdout) as BatchReport;
    expect(batch.summary.requested).toBe(2);
    expect(batch.summary.processed).toBe(2);
    expect(batch.pairs[0]!.report?.status).toBe('pass');
    expect(batch.pairs[1]!.error).not.toBeNull();
  });

  it('applies shared approvals only to matching pairs and diagnoses globally stale decisions once', async () => {
    const cwd = await workspace();
    await files(cwd);
    await writeFile(join(cwd, 'after.json'), manifest('Revised'));
    await writeFile(join(cwd, 'other-before.json'), manifest('Other'));
    await writeFile(join(cwd, 'other-after.json'), manifest('Other'));
    await writeFile(
      join(cwd, 'pairs.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        pairs: [
          { key: 'change', baseline: 'before.json', candidate: 'after.json' },
          { key: 'same', baseline: 'other-before.json', candidate: 'other-after.json' },
        ],
      }),
    );
    const first = JSON.parse((await invoke(['batch', 'pairs.json'], cwd)).stdout) as BatchReport;
    const decisions = first.pairs.flatMap(
      (pair) =>
        pair.report?.findings.map((finding) => ({
          findingId: finding.id,
          reason: 'Reviewed correction',
        })) ?? [],
    );
    expect(decisions.length).toBeGreaterThan(0);
    await writeFile(
      join(cwd, 'policy.json'),
      JSON.stringify({ schemaVersion: '1.0', uriRules: [], acceptedChanges: decisions }),
    );
    const accepted = await invoke(['batch', 'pairs.json', '--policy', 'policy.json'], cwd);
    expect(accepted.code).toBe(0);
    expect((JSON.parse(accepted.stdout) as BatchReport).issues).toEqual([]);
    decisions.push({ findingId: '0'.repeat(64), reason: 'Old decision' });
    await writeFile(
      join(cwd, 'policy.json'),
      JSON.stringify({ schemaVersion: '1.0', uriRules: [], acceptedChanges: decisions }),
    );
    const stale = await invoke(['batch', 'pairs.json', '--policy', 'policy.json'], cwd);
    expect(stale.code).toBe(3);
    expect(
      (JSON.parse(stale.stdout) as BatchReport).issues.filter(
        (issue) => issue.code === 'STALE_APPROVAL',
      ),
    ).toHaveLength(1);
  });

  it('rejects traversal and symlink escapes while preserving the other pair results', async () => {
    const cwd = await workspace();
    await files(cwd);
    await mkdir(join(cwd, 'nested'));
    await symlink(join(cwd, 'before.json'), join(cwd, 'nested/escape.json'));
    await writeFile(
      join(cwd, 'nested/pairs.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        pairs: [
          { key: 'traversal', baseline: '../before.json', candidate: 'escape.json' },
          { key: 'symlink', baseline: 'escape.json', candidate: 'escape.json' },
        ],
      }),
    );
    const result = await invoke(['batch', 'nested/pairs.json'], cwd);
    expect(result.code).toBe(4);
    const batch = JSON.parse(result.stdout) as BatchReport;
    expect(batch.pairs.map((pair) => pair.error?.code)).toEqual([
      'PAIR_PATH_ESCAPE',
      'PAIR_SYMLINK_ESCAPE',
    ]);
  });

  it('checks optional inventories and blocks duplicate assignments', async () => {
    const cwd = await workspace();
    await mkdir(join(cwd, 'baseline'));
    await mkdir(join(cwd, 'candidate'));
    await writeFile(join(cwd, 'baseline/a.json'), manifest());
    await writeFile(join(cwd, 'candidate/a.json'), manifest());
    await writeFile(join(cwd, 'baseline/forgotten.json'), manifest());
    const pair = { key: 'a', baseline: 'baseline/a.json', candidate: 'candidate/a.json' };
    await writeFile(
      join(cwd, 'pairs.json'),
      JSON.stringify({ schemaVersion: '1.0', pairs: [pair] }),
    );
    const result = await invoke(
      ['batch', 'pairs.json', '--baseline-dir', 'baseline', '--candidate-dir', 'candidate'],
      cwd,
    );
    expect(result.code).toBe(3);
    expect((JSON.parse(result.stdout) as BatchReport).issues[0]!.code).toBe('UNPAIRED_INPUT');
    await symlink(join(cwd, 'baseline'), join(cwd, 'baseline-alias'));
    expect(
      (
        await invoke(
          [
            'batch',
            'pairs.json',
            '--baseline-dir',
            'baseline',
            '--output',
            'baseline-alias/new/report.json',
          ],
          cwd,
        )
      ).code,
    ).toBe(4);
    await expect(readFile(join(cwd, 'baseline/new/report.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await writeFile(
      join(cwd, 'pairs.json'),
      JSON.stringify({ schemaVersion: '1.0', pairs: [pair, { ...pair, key: 'duplicate' }] }),
    );
    expect((await invoke(['batch', 'pairs.json'], cwd)).code).toBe(4);
    expect(
      (
        await invoke(
          ['batch', 'pairs.json', '--baseline-dir', 'baseline', '--output', 'baseline/report.json'],
          cwd,
        )
      ).code,
    ).toBe(4);
  });

  it('rejects duplicate JSON properties, duplicate keys, comments and empty configurations', () => {
    expect(() => parsePairs('{"schemaVersion":"1.0","schemaVersion":"1.0","pairs":[]}')).toThrow(
      /Duplicate/u,
    );
    expect(() => parsePairs('{"schemaVersion":"1.0","pairs":[]}')).toThrow(/between/u);
    expect(() => parsePairs('{/*comment*/"schemaVersion":"1.0","pairs":[]}')).toThrow(
      /strict JSON/u,
    );
    expect(() =>
      parsePairs(
        JSON.stringify({
          schemaVersion: '1.0',
          pairs: [
            { key: 'a', baseline: 'a', candidate: 'b' },
            { key: 'a', baseline: 'c', candidate: 'd' },
          ],
        }),
      ),
    ).toThrow(/unique/u);
  });
});
