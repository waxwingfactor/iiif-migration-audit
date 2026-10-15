import { afterEach, expect, it } from 'vitest';
import { mkdtemp, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AuditReport } from '../src/core/types';

const execute = promisify(execFile);
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it('builds a standalone executable that runs outside the repository without node_modules', async () => {
  await execute(process.execPath, ['scripts/build-cli.mjs'], { cwd: resolve('.') });
  expect(await readFile('dist/cli/index.js', 'utf8')).toContain('Permission is hereby granted');
  expect(await readFile('dist/cli/THIRD_PARTY_NOTICES.txt', 'utf8')).toContain(
    'Microsoft Corporation',
  );
  const directory = await mkdtemp(join(tmpdir(), 'iiif-audit-bundle-'));
  directories.push(directory);
  await cp('dist/cli/index.js', join(directory, 'index.js'));
  await cp('examples', join(directory, 'examples'), { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  const help = await execute(process.execPath, ['index.js', '--help'], { cwd: directory });
  expect(help.stdout).toContain('iiif-audit compare');
  const clean = await execute(
    process.execPath,
    ['index.js', 'compare', 'examples/baseline/book.json', 'examples/candidate/book.json'],
    { cwd: directory },
  );
  const report = JSON.parse(clean.stdout) as AuditReport;
  expect(report.status).toBe('pass');
  expect(report.baseline.version).toBe('2.1');
  expect(report.candidate.version).toBe('3.0');
  expect(report.baseline.canvasCount).toBe(2);
  try {
    await execute(
      process.execPath,
      ['index.js', 'compare', 'examples/baseline/book.json', 'examples/candidate/book-loss.json'],
      { cwd: directory },
    );
    throw new Error('Damaged comparison unexpectedly succeeded');
  } catch (error) {
    expect(error).toMatchObject({ code: 2 });
    expect(error).toHaveProperty('stdout');
    const failed = JSON.parse((error as { stdout: string }).stdout) as AuditReport;
    expect(failed.status).toBe('fail');
    expect(failed.summary.errors).toBe(2);
  }
}, 15_000);
