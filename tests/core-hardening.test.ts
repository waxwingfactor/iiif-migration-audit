import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { audit, emptyPolicy } from '../src/core/index';

const book = () =>
  JSON.parse(readFileSync(new URL('./fixtures/authored/v3-book.json', import.meta.url), 'utf8'));
const input = (value: unknown) => ({ name: 'snapshot.json', text: JSON.stringify(value) });
const run = (before: unknown, after: unknown) => audit(input(before), input(after));

describe('adversarial preservation boundaries', () => {
  it.each([
    'description',
    'license',
    'related',
    'within',
    'viewingHint',
    'startCanvas',
    'sequences',
  ])('does not silently whitelist an unassessed legacy %s on v3', async (key) => {
    const before = book();
    before[key] = 'legacy content';
    const report = await run(before, before);
    expect(report.status).toBe('incomplete');
    expect(report.coverage.some((notice) => notice.pointer === `/${key}`)).toBe(true);
  });

  it('does not ignore legacy painting content hidden beside valid v3 pages', async () => {
    const before = book();
    before.items[0].images = [{ resource: { '@id': 'https://example.org/extra.jpg' } }];
    expect((await run(before, before)).status).toBe('incomplete');
  });

  it('retains equivalent language tags regardless of letter case', async () => {
    const before = book();
    before.label = { 'EN-us': ['A book'] };
    const after = book();
    after.label = { 'en-US': ['A book'] };
    expect((await run(before, after)).status).toBe('pass');
  });

  it('uses real source pointers for identifier findings on v3-to-v3 comparisons', async () => {
    const before = book();
    const after = book();
    after.id += '-changed';
    const report = await run(before, after);
    const finding = report.findings.find((entry) => entry.code === 'MANIFEST_ID_CHANGED');
    expect(finding?.pointers).toEqual({ baseline: '/id', candidate: '/id' });
  });

  it('keeps fingerprint semantics stable when independent URI rules change input order', async () => {
    const before = book();
    const after = book();
    delete after.label.fr;
    const policy = emptyPolicy();
    policy.uriRules = [
      {
        scope: 'image',
        fromPrefix: 'https://old.example/images/',
        toPrefix: 'https://new.example/images/',
      },
      {
        scope: 'link',
        fromPrefix: 'https://old.example/data/',
        toPrefix: 'https://new.example/data/',
      },
    ];
    const first = await audit(input(before), input(after), { policy });
    const second = await audit(input(before), input(after), {
      policy: { ...policy, uriRules: [...policy.uriRules].reverse() },
    });
    expect(first.findings.map((finding) => finding.id)).toEqual(
      second.findings.map((finding) => finding.id),
    );
  });

  it('does not crash on a deep flat Range reference graph', async () => {
    const before = book();
    before.structures = Array.from({ length: 2_000 }, (_, index) => ({
      id: `https://example.org/range/${index}`,
      type: 'Range',
      label: { none: [`Section ${index}`] },
      items:
        index < 1_999
          ? [{ id: `https://example.org/range/${index + 1}`, type: 'Range' }]
          : [{ id: before.items[0].id, type: 'Canvas' }],
    }));
    const report = await run(before, before);
    expect(report.status).toBe('incomplete');
    expect(report.coverage.some((notice) => notice.code === 'RANGE_GRAPH_DEPTH')).toBe(true);
  });
});

it('blocks image mappings that collapse distinct source images into one identity', async () => {
  const before = book();
  const after = book();
  const first = before.items[0].items[0].items[0].body.id;
  const second = before.items[1].items[0].items[0].body.id;
  const replacement = 'https://images.example.test/collapsed.jpg';
  after.items[0].items[0].items[0].body.id = replacement;
  after.items[1].items[0].items[0].body.id = replacement;
  const policy = emptyPolicy();
  policy.uriRules = [
    { scope: 'image', fromPrefix: first, toPrefix: replacement },
    { scope: 'image', fromPrefix: second, toPrefix: replacement },
  ];
  const report = await audit(input(before), input(after), { policy });
  expect(report.status).toBe('incomplete');
  expect(report.coverage.some((notice) => notice.code === 'URI_IDENTITY_COLLISION')).toBe(true);
});

it('accepts a UTF-8 BOM without changing the original snapshot hash', async () => {
  const text = '\ufeff' + JSON.stringify(book());
  const report = await audit({ name: 'bom.json', text }, { name: 'bom.json', text });
  expect(report.status).toBe('pass');
  const plain = await run(book(), book());
  expect(report.baseline.sha256).not.toBe(plain.baseline.sha256);
});

it('names the failed input in a parse diagnostic without changing its stable code', async () => {
  await expect(
    audit(input(book()), { name: 'replacement.json', text: '{broken' }),
  ).rejects.toMatchObject({
    code: 'INVALID_JSON',
    message: expect.stringContaining('Candidate ("replacement.json")'),
  });
});
