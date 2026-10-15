import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scratch = mkdtempSync(join(tmpdir(), 'iiif-package-smoke-'));
const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

try {
  assert.equal(
    Object.keys(metadata.dependencies ?? {}).length,
    0,
    'Bundled CLI must have no registry runtime dependencies.',
  );
  const packed = JSON.parse(
    execFileSync(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], {
      cwd: root,
      encoding: 'utf8',
    }),
  )[0];
  assert.ok(
    packed.files.some((file) => file.path === 'dist/cli/index.js'),
    'CLI bundle missing from package.',
  );
  assert.ok(
    !packed.files.some((file) => /(^|\/)(\.env|node_modules|tests|work)(\/|$)/.test(file.path)),
    'Private/development files leaked into package.',
  );
  const install = join(scratch, 'install');
  execFileSync(
    npm,
    [
      'install',
      '--prefix',
      install,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(scratch, packed.filename),
    ],
    { encoding: 'utf8' },
  );
  const bin = join(install, 'node_modules', metadata.name, 'dist', 'cli', 'index.js');
  const invoke = (args, expected = 0) => {
    const result = spawnSync(process.execPath, [bin, ...args], {
      cwd: scratch,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(
      result.status,
      expected,
      `CLI exit for ${args.join(' ')}: ${result.stderr || result.error?.message}`,
    );
    return result.stdout;
  };
  assert.ok(invoke(['--version']).includes(metadata.version));
  assert.ok(invoke(['--help']).includes('compare'));
  const fixtures = join(scratch, 'fixtures');
  mkdirSync(fixtures);
  const baseline = readFileSync(
    join(root, 'tests', 'fixtures', 'authored', 'v2-book.json'),
    'utf8',
  );
  const candidate = readFileSync(
    join(root, 'tests', 'fixtures', 'authored', 'v3-book.json'),
    'utf8',
  );
  writeFileSync(join(fixtures, 'before.json'), baseline);
  writeFileSync(join(fixtures, 'after.json'), candidate);
  const clean = JSON.parse(
    invoke(['compare', 'fixtures/before.json', 'fixtures/after.json', '--format', 'json']),
  );
  assert.equal(clean.status, 'pass');
  const damaged = JSON.parse(candidate);
  delete damaged.rights;
  writeFileSync(join(fixtures, 'loss.json'), JSON.stringify(damaged));
  const loss = JSON.parse(
    invoke(['compare', 'fixtures/before.json', 'fixtures/loss.json', '--format', 'json'], 2),
  );
  assert.ok(
    loss.findings.some((finding) => finding.category === 'rights' && finding.severity === 'error'),
  );
  invoke([
    'compare',
    'fixtures/before.json',
    'fixtures/after.json',
    '--format',
    'html',
    '--output',
    'review.html',
  ]);
  const html = readFileSync(join(scratch, 'review.html'), 'utf8');
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(!/<script[\s>]/i.test(html));
  writeFileSync(
    join(fixtures, 'pairs.json'),
    JSON.stringify({
      schemaVersion: '1.0',
      pairs: [{ key: 'book', baseline: 'before.json', candidate: 'after.json' }],
    }),
  );
  const batch = JSON.parse(invoke(['batch', 'fixtures/pairs.json', '--format', 'json']));
  assert.equal(batch.status, 'pass');
  assert.equal(batch.pairs.length, 1);
  console.log(
    `Package smoke passed: ${packed.filename}; offline install, version/help, equivalent/loss comparisons, HTML and corpus audit.`,
  );
} finally {
  rmSync(resolve(scratch), { recursive: true, force: true });
}
