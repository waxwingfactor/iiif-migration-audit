import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { applyDecisions, audit, emptyPolicy, parsePolicy } from '../src/core/index.js';
import type { AuditPolicy, AuditReport, Category } from '../src/core/types.js';

// These assertions were designed from public specifications and fixtures before
// reading the engine. No production normalizer or converter generates the oracle.
const fixedTime = '2026-10-15T12:00:00.000Z';
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const authored = (version: 'v2' | 'v3') => JSON.parse(fixture(`authored/${version}-book.json`));
const official = (name: string) => JSON.parse(fixture(`official/${name}.json`));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const input = (value: unknown, name: string) => ({ name, text: JSON.stringify(value) });
const run = (before: unknown, after: unknown, policy?: AuditPolicy) =>
  audit(input(before, 'before.json'), input(after, 'after.json'), {
    generatedAt: fixedTime,
    ...(policy ? { policy } : {}),
  });
const changed = (report: AuditReport, category: Category) =>
  report.findings.filter(
    (finding) =>
      finding.category === category &&
      !finding.accepted &&
      finding.severity !== 'info' &&
      JSON.stringify(finding.before) !== JSON.stringify(finding.after),
  );
const requireEvidence = (report: AuditReport, category: Category) => {
  expect(report.status).not.toBe('pass');
  const findings = changed(report, category);
  expect(findings.length).toBeGreaterThan(0);
  for (const finding of findings) {
    expect(finding.message.trim().length).toBeGreaterThan(0);
    expect(finding.path.length).toBeGreaterThan(0);
    expect(finding.pointers.baseline || finding.pointers.candidate).toBeTruthy();
  }
  return findings;
};

async function mustBlock(operation: () => Promise<AuditReport>) {
  let report: AuditReport;
  try {
    report = await operation();
  } catch (error) {
    // Invalid original input may be rejected before an AuditReport exists.
    // Require a structured public error rather than accepting any crash.
    expect(error).toBeInstanceOf(Error);
    expect(typeof (error as { code?: unknown }).code).toBe('string');
    expect((error as Error).message.length).toBeGreaterThan(0);
    return;
  }
  expect(['fail', 'incomplete']).toContain(report.status);
  expect(report.summary.errors + report.coverage.length).toBeGreaterThan(0);
}

describe('independent authored cross-version preservation', () => {
  it('recognizes a hand-authored equivalent book without collapsing repeated labels or metadata', async () => {
    const report = await run(authored('v2'), authored('v3'));
    expect(report.status).toBe('pass');
    expect(report.coverage).toEqual([]);
    expect(report.baseline.version).toBe('2.1');
    expect(report.candidate.version).toBe('3.0');
    expect(report.baseline.canvasCount).toBe(3);
    expect(report.candidate.canvasCount).toBe(3);
    expect(report.summary.matchedCanvases).toBe(3);
    expect(report.summary.removedCanvases).toBe(0);
    expect(report.summary.addedCanvases).toBe(0);
    expect(report.canvasPairs.map((pair) => pair.baselineIndex)).toEqual([0, 1, 2]);
    expect(new Set(report.canvasPairs.map((pair) => pair.baselineId)).size).toBe(3);
  });

  it('does not mutate original JSON objects or the supplied policy', async () => {
    const before = authored('v2');
    const after = authored('v3');
    const policy = emptyPolicy();
    const saved = JSON.stringify({ before, after, policy });
    await run(before, after, policy);
    expect(JSON.stringify({ before, after, policy })).toBe(saved);
  });

  it('compares JSON object members independently of serialization order', async () => {
    const before = authored('v3');
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, item]) => [key, reverseKeys(item)]),
        );
      }
      return value;
    };
    expect((await run(before, reverseKeys(before))).status).toBe('pass');
  });

  it('binds source evidence to the exact original bytes and injected clock', async () => {
    const text = fixture('authored/v3-book.json');
    const report = await audit(
      { name: 'left.json', text },
      { name: 'right.json', text },
      {
        generatedAt: fixedTime,
      },
    );
    expect(report.baseline.sha256).toBe(createHash('sha256').update(text).digest('hex'));
    expect(report.candidate.sha256).toBe(report.baseline.sha256);
    expect(report.generatedAt).toBe(fixedTime);
  });
});

describe('specific user-visible losses', () => {
  it.each([
    ['viewingDirection', 'right-to-left'],
    ['behavior', ['continuous']],
    ['start', { id: 'https://library.example.test/object/book/canvas/b', type: 'Canvas' }],
  ] as const)(
    'requires review when newly added %s changes default navigation',
    async (key, value) => {
      const before = authored('v3');
      delete before[key];
      const after = clone(before);
      after[key] = clone(value);
      requireEvidence(await run(before, after), 'navigation');
    },
  );

  it.each([
    ['the French title', (d: ReturnType<typeof authored>) => delete d.label.fr, 'description'],
    [
      'one repeated metadata row',
      (d: ReturnType<typeof authored>) => d.metadata.splice(1, 1),
      'description',
    ],
    [
      'the metadata presentation order',
      (d: ReturnType<typeof authored>) => d.metadata.reverse(),
      'description',
    ],
    ['the license assertion', (d: ReturnType<typeof authored>) => delete d.rights, 'rights'],
    [
      'a page label',
      (d: ReturnType<typeof authored>) => {
        d.items[1].label.en = ['Wrong folio'];
      },
      'description',
    ],
    [
      'a canvas coordinate dimension',
      (d: ReturnType<typeof authored>) => {
        d.items[1].width = 600;
      },
      'content',
    ],
    [
      'an image assignment',
      (d: ReturnType<typeof authored>) => {
        d.items[1].items[0].items[0].body.id = 'https://images.example.test/wrong.jpg';
      },
      'content',
    ],
    [
      'the reading direction',
      (d: ReturnType<typeof authored>) => {
        d.viewingDirection = 'left-to-right';
      },
      'navigation',
    ],
    [
      'the paging behavior',
      (d: ReturnType<typeof authored>) => {
        d.behavior = ['individuals'];
      },
      'navigation',
    ],
  ] as const)(
    'detects loss or change of %s with original evidence',
    async (_name, mutate, category) => {
      const before = authored('v3');
      const after = clone(before);
      mutate(after);
      requireEvidence(await run(before, after), category);
    },
  );

  it('finds missing pages despite duplicate labels on the surviving pages', async () => {
    const before = authored('v3');
    const after = clone(before);
    after.items.splice(1, 1);
    const report = await run(before, after);
    expect(report.status).toBe('fail');
    expect(report.summary.removedCanvases).toBe(1);
    expect(report.summary.addedCanvases).toBe(0);
    requireEvidence(report, 'pages');
  });

  it('finds reading-order changes even though every canvas ID remains present', async () => {
    const before = authored('v3');
    const after = clone(before);
    after.items.reverse();
    const report = await run(before, after);
    expect(report.summary.matchedCanvases).toBe(3);
    expect(report.summary.removedCanvases + report.summary.addedCanvases).toBe(0);
    expect(report.status).not.toBe('pass');
    expect(report.findings.some((f) => ['pages', 'navigation'].includes(f.category))).toBe(true);
  });

  it('does not confuse a valid different canvas/image dimension with lost source data', async () => {
    const document = official('v2-26');
    const report = await run(document, clone(document));
    expect(report.summary.errors).toBe(0);
    expect(changed(report, 'content')).toEqual([]);
  });

  it('preserves repeated language values rather than comparing a set', async () => {
    const before = authored('v3');
    before.label.en.push('A book');
    const after = clone(before);
    after.label.en.pop();
    requireEvidence(await run(before, after), 'description');
  });
});

describe('official examples exercise substantive semantics', () => {
  it('verifies all unmodified source snapshots against independently recorded hashes', () => {
    const sources = JSON.parse(fixture('official/SOURCES.json')) as Array<{
      file: string;
      bytes: number;
      sha256: string;
      context: string;
    }>;
    expect(sources.length).toBeGreaterThanOrEqual(10);
    for (const source of sources) {
      const bytes = readFileSync(new URL(`./fixtures/official/${source.file}`, import.meta.url));
      expect(bytes.byteLength).toBe(source.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(JSON.parse(bytes.toString())['@context']).toBe(source.context);
    }
  });

  it('compares the real negotiated pair without inventing page or image loss', async () => {
    const v2 = official('0057-v2');
    const v3 = official('0057-v3');
    expect(v2['@context']).not.toBe(v3['@context']);
    expect(v2['@id']).toBe(v3.id);
    const report = await run(v2, v3);
    expect(report.summary.matchedCanvases).toBe(1);
    expect(report.summary.removedCanvases + report.summary.addedCanvases).toBe(0);
    expect(changed(report, 'content')).toEqual([]);
    // Untagged v2 title becomes en in v3; that is not a zero-difference oracle.
    expect(report.baseline.version).toBe('2.1');
    expect(report.candidate.version).toBe('3.0');
  });

  it('finds a loss of only the French values in an official language-map fixture', async () => {
    const before = official('0006-text-language');
    const after = clone(before);
    delete after.label.fr;
    delete after.summary.fr;
    requireEvidence(await run(before, after), 'description');
  });

  it('finds a changed painting order in the official composition specimen', async () => {
    const before = official('0036-composition-from-multiple-images');
    const after = clone(before);
    after.items[0].items[0].items.reverse();
    requireEvidence(await run(before, after), 'content');
  });

  it('finds a changed spatial target without requiring an image URL change', async () => {
    const before = official('0036-composition-from-multiple-images');
    const after = clone(before);
    after.items[0].items[0].items[1].target = before.items[0].id + '#xywh=1,2,3,4';
    requireEvidence(await run(before, after), 'content');
  });

  it('retains nested range membership and does not replace it with a flattened set', async () => {
    const before = official('0024-book-4-toc');
    const after = clone(before);
    // Monday loses p4 while all six primary canvases remain in the manifest.
    after.structures[0].items[1].items[0].items.pop();
    const report = await run(before, after);
    expect(report.summary.matchedCanvases).toBe(6);
    requireEvidence(report, 'navigation');
  });

  it('does not mistake identical external references for inspected annotation bodies', async () => {
    const document = authored('v3');
    document.items[0].annotations = [
      { id: 'https://library.example.test/annotations/page-a', type: 'AnnotationPage' },
    ];
    const report = await run(document, clone(document));
    expect(report.status).toBe('incomplete');
    expect(report.coverage.length).toBeGreaterThan(0);
  });

  it('does not fetch source URLs while comparing local snapshots', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected network request'));
    try {
      const document = authored('v3');
      document.rendering = [
        {
          id: 'https://library.example.test/book.pdf',
          type: 'Text',
          format: 'application/pdf',
          label: { en: ['PDF'] },
        },
      ];
      await run(document, clone(document));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('finds changed link descriptors even when the linked URL is unchanged', async () => {
    const before = authored('v3');
    before.seeAlso = [
      {
        id: 'https://library.example.test/book.mods',
        type: 'Dataset',
        format: 'text/xml',
        profile: 'http://www.loc.gov/mods/v3',
        label: { en: ['MODS'] },
      },
    ];
    const after = clone(before);
    after.seeAlso[0].format = 'text/plain';
    const report = await run(before, after);
    expect(report.status).not.toBe('pass');
    expect(
      report.findings.some(
        (finding) =>
          JSON.stringify(finding.before).includes('text/xml') &&
          JSON.stringify(finding.after).includes('text/plain'),
      ),
    ).toBe(true);
  });

  it('does not lose Canvas-level metadata behind unchanged root metadata', async () => {
    const before = authored('v3');
    before.items[0].metadata = [
      { label: { en: ['Condition'] }, value: { en: ['Original binding'] } },
    ];
    const after = clone(before);
    delete after.items[0].metadata;
    requireEvidence(await run(before, after), 'description');
  });

  it('keeps Image API protocol changes visible independently of Presentation version', async () => {
    const before = authored('v3');
    before.items[0].items[0].items[0].body.service = [
      {
        '@context': 'http://iiif.io/api/image/2/context.json',
        id: 'https://images.example.test/service/a',
        type: 'ImageService2',
        profile: 'http://iiif.io/api/image/2/level1.json',
      },
    ];
    const after = clone(before);
    Object.assign(after.items[0].items[0].items[0].body.service[0], {
      '@context': 'http://iiif.io/api/image/3/context.json',
      type: 'ImageService3',
      profile: 'level1',
    });
    requireEvidence(await run(before, after), 'content');
  });
});

describe('identity and policy controls', () => {
  it('does not authorize provider logo image moves through an ordinary-link rule', async () => {
    const before = authored('v3');
    for (const [index, canvas] of before.items.entries()) {
      canvas.items[0].items[0].id = 'https://annotations.example.test/' + index;
    }
    before.provider = [
      {
        id: 'https://library.example.test/org',
        type: 'Agent',
        label: { en: ['Library'] },
        logo: [{ id: 'https://library.example.test/logo.png', type: 'Image', format: 'image/png' }],
      },
    ];
    const after = clone(before);
    after.provider[0].id = 'https://new-library.example.test/org';
    after.provider[0].logo[0].id = 'https://new-library.example.test/logo.png';
    const policy = emptyPolicy();
    policy.uriRules = [
      {
        scope: 'link',
        fromPrefix: 'https://library.example.test/',
        toPrefix: 'https://new-library.example.test/',
      },
    ];
    requireEvidence(await run(before, after, policy), 'content');
  });

  it.each(['', '/'])(
    'keeps image host authorization separate from Canvas identity authorization (prefix suffix %j)',
    async (suffix) => {
      const before = authored('v3');
      const after = clone(before);
      after.items[0].id = 'https://new-library.example.test/object/book/canvas/a';
      after.items[0].items[0].items[0].target = after.items[0].id;
      const policy = emptyPolicy();
      policy.uriRules = [
        {
          scope: 'image',
          fromPrefix: 'https://library.example.test' + suffix,
          toPrefix: 'https://new-library.example.test' + suffix,
        },
      ];
      const report = await run(before, after, policy);
      expect(report.status).not.toBe('pass');
      expect(report.summary.removedCanvases).toBe(1);
      expect(report.summary.addedCanvases).toBe(1);
    },
  );

  it.each(['', '/'])(
    'matches explicitly rewritten Canvas identities but keeps the identity change visible (prefix suffix %j)',
    async (suffix) => {
      const before = authored('v3');
      const after = clone(before);
      for (const canvas of after.items) {
        canvas.id = canvas.id.replace(
          'https://library.example.test',
          'https://new-library.example.test',
        );
        canvas.items[0].items[0].target = canvas.id;
      }
      const policy = emptyPolicy();
      policy.uriRules = [
        {
          scope: 'canvas',
          fromPrefix: 'https://library.example.test' + suffix,
          toPrefix: 'https://new-library.example.test' + suffix,
        },
      ];
      const report = await run(before, after, policy);
      expect(report.summary.matchedCanvases).toBe(3);
      expect(report.canvasPairs.every((pair) => pair.matchedBy === 'uri-rule')).toBe(true);
      expect(report.findings.some((finding) => finding.category === 'identity')).toBe(true);
    },
  );

  it('does not match URI prefixes across path boundaries', async () => {
    const before = authored('v3');
    before.items[0].id = 'https://library.example.test/object/book/canvases-extra/a';
    before.items[0].items[0].items[0].target = before.items[0].id;
    const after = clone(before);
    after.items[0].id = 'https://new-library.example.test/object/book/canvases-extra/a';
    after.items[0].items[0].items[0].target = after.items[0].id;
    const policy = emptyPolicy();
    policy.uriRules = [
      {
        scope: 'canvas',
        fromPrefix: 'https://library.example.test/object/book/canvases',
        toPrefix: 'https://new-library.example.test/object/book/canvases',
      },
    ];
    const report = await run(before, after, policy);
    expect(report.summary.matchedCanvases).toBe(2);
  });

  it('blocks non-injective identity mapping rather than arbitrarily pairing two pages', async () => {
    const before = authored('v3');
    before.items[0].id += '/page';
    before.items[2].id += '/page';
    before.items[0].items[0].items[0].target = before.items[0].id;
    before.items[2].items[0].items[0].target = before.items[2].id;
    const after = clone(before);
    const policy = emptyPolicy();
    policy.uriRules = [
      {
        scope: 'canvas',
        fromPrefix: 'https://library.example.test/object/book/canvas/a/',
        toPrefix: 'https://library.example.test/object/book/canvas/c/',
      },
    ];
    await mustBlock(() => run(before, after, policy));
  });

  it('retains accepted evidence and does not approve a later unrelated loss', async () => {
    const before = authored('v3');
    const after = clone(before);
    delete after.label.fr;
    const report = await run(before, after);
    const decisions = report.findings
      .filter((f) => f.severity !== 'info')
      .map((finding) => ({
        findingId: finding.id,
        reason: 'Intentional language retirement in this fixture.',
      }));
    expect(decisions.length).toBeGreaterThan(0);
    const reviewed = applyDecisions(report, decisions);
    expect(reviewed.status).toBe('pass');
    expect(reviewed.summary.accepted).toBe(decisions.length);
    expect(
      reviewed.findings
        .filter((finding) => finding.accepted)
        .every((finding) => finding.before !== undefined && finding.after !== undefined),
    ).toBe(true);
    const newCandidate = clone(after);
    delete newCandidate.rights;
    const policy = { ...emptyPolicy(), acceptedChanges: decisions };
    const rerun = await run(before, newCandidate, policy);
    expect(rerun.status).not.toBe('pass');
    expect(changed(rerun, 'rights').length).toBeGreaterThan(0);
  });

  it('does not permit an accepted change to erase incomplete coverage', async () => {
    const document = authored('v3');
    document.unrecognizedExtension = 'Important unpublished content';
    const report = await run(document, clone(document));
    const reviewed = applyDecisions(
      report,
      report.findings.map((f) => ({ findingId: f.id, reason: 'Reviewed in test.' })),
    );
    expect(reviewed.status).toBe('incomplete');
  });

  it('rejects blank reasons and unknown policy structure', () => {
    expect(() =>
      parsePolicy(
        JSON.stringify({
          ...emptyPolicy(),
          acceptedChanges: [{ findingId: 'a'.repeat(64), reason: '   ' }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parsePolicy(JSON.stringify({ ...emptyPolicy(), ignoreEverything: true })),
    ).toThrow();
  });

  it('produces stable finding identities for the same exact evidence', async () => {
    const before = authored('v3');
    const after = clone(before);
    delete after.rights;
    const first = await run(before, after);
    const second = await run(before, after);
    expect(second.findings.map((f) => f.id)).toEqual(first.findings.map((f) => f.id));
  });
});

describe('conservative completeness and bounded malformed input handling', () => {
  it.each([
    [
      'legacy annotation-page links',
      (d: ReturnType<typeof authored>) => {
        d.items[0].otherContent = [
          { '@id': 'https://library.example.test/ocr-a', '@type': 'sc:AnnotationList' },
        ];
      },
      (d: ReturnType<typeof authored>) => {
        delete d.items[0].otherContent;
      },
    ],
    [
      'a scoped Canvas context',
      (d: ReturnType<typeof authored>) => {
        d.items[0]['@context'] = { label: 'https://custom.example.test/different-semantics' };
      },
      (d: ReturnType<typeof authored>) => {
        delete d.items[0]['@context'];
      },
    ],
    [
      'a shadowed legacy painting body',
      (d: ReturnType<typeof authored>) => {
        d.items[0].items[0].items[0].resource = {
          '@id': 'https://images.example.test/lost.jpg',
          '@type': 'dctypes:Image',
        };
      },
      (d: ReturnType<typeof authored>) => {
        delete d.items[0].items[0].items[0].resource;
      },
    ],
    [
      'shadowed legacy Range members',
      (d: ReturnType<typeof authored>) => {
        d.structures = [
          {
            id: 'https://library.example.test/range/one',
            type: 'Range',
            label: { en: ['Range'] },
            items: [{ id: d.items[0].id, type: 'Canvas' }],
            canvases: [d.items[1].id],
          },
        ];
      },
      (d: ReturnType<typeof authored>) => {
        delete d.structures[0].canvases;
      },
    ],
  ] as const)(
    'does not silently certify loss of %s as fully assessed',
    async (_name, inject, remove) => {
      const before = authored('v3');
      inject(before);
      const after = clone(before);
      remove(after);
      await mustBlock(() => run(before, after));
    },
  );

  it('blocks duplicate Canvas identifiers rather than deduplicating them', async () => {
    const document = authored('v3');
    document.items[2].id = document.items[0].id;
    await mustBlock(() => run(document, clone(document)));
  });

  it('does not pass identical unknown extension content as fully checked', async () => {
    const document = authored('v3');
    document.customCatalogRecord = { preservationNote: 'must remain visible' };
    const report = await run(document, clone(document));
    expect(report.status).toBe('incomplete');
    expect(report.coverage.some((notice) => notice.pointer.includes('customCatalogRecord'))).toBe(
      true,
    );
  });

  it('does not silently inspect only the first of multiple v2 sequences', async () => {
    const document = authored('v2');
    document.sequences.push(clone(document.sequences[0]));
    document.sequences[1]['@id'] += '-alternative';
    document.sequences[1].canvases.reverse();
    const report = await run(document, clone(document));
    expect(report.status).toBe('incomplete');
    expect(report.coverage.length).toBeGreaterThan(0);
  });

  it('retains the fact that Sequence metadata needs a deliberate migration decision', async () => {
    const document = official('v2-21');
    const report = await run(document, clone(document));
    expect(report.status).toBe('incomplete');
    expect(report.coverage.some((notice) => notice.pointer.includes('sequences'))).toBe(true);
  });

  it('rejects v4 instead of silently projecting it into the supported profile', async () => {
    const document = authored('v3');
    document['@context'] = 'http://iiif.io/api/presentation/4/context.json';
    await mustBlock(() => run(document, document));
  });

  it.each(['null', '[]', '42', '{"@context":', '{"label":"first","label":"second"}'])(
    'blocks malformed or non-manifest original text %s',
    async (text) => {
      await mustBlock(() =>
        audit({ name: 'broken.json', text }, input(authored('v3'), 'valid.json')),
      );
    },
  );

  it('does not accept duplicate keys even when their last value would produce a valid manifest', async () => {
    const text = JSON.stringify(authored('v3')).replace(
      '"type":"Manifest"',
      '"type":"Collection","type":"Manifest"',
    );
    expect(text).toContain('"type":"Collection","type":"Manifest"');
    await mustBlock(() =>
      audit({ name: 'duplicate-key.json', text }, input(authored('v3'), 'valid.json')),
    );
  });

  it('does not claim complete preservation of a nonfinite parsed dimension', async () => {
    const text = JSON.stringify(authored('v3')).replace('"width":1200', '"width":1e400');
    expect(text).toContain('"width":1e400');
    await mustBlock(() =>
      audit({ name: 'overflow.json', text }, { name: 'same-overflow.json', text }),
    );
  });

  it('does not round distinct unsafe integer dimensions into a clean equality', async () => {
    const original = JSON.stringify(authored('v3'));
    const before = original.replace('"width":1200', '"width":9007199254740993');
    const after = original.replace('"width":1200', '"width":9007199254740992');
    expect(before).not.toBe(after);
    await mustBlock(() =>
      audit(
        { name: 'unsafe-before.json', text: before },
        { name: 'unsafe-after.json', text: after },
      ),
    );
  });

  it('terminates safely on a cyclic externally referenced range graph', async () => {
    const document = authored('v3');
    document.structures = [
      {
        id: 'https://library.example.test/range/loop',
        type: 'Range',
        label: { en: ['Cycle'] },
        items: [{ id: 'https://library.example.test/range/loop', type: 'Range' }],
      },
    ];
    await mustBlock(() => run(document, clone(document)));
  });

  it('bounds nesting instead of crashing from deeply nested original JSON', async () => {
    const text = '{"value":'.repeat(600) + 'null' + '}'.repeat(600);
    await mustBlock(() => audit({ name: 'deep.json', text }, input(authored('v3'), 'valid.json')));
  });

  it('bounds source size before constructing an unbounded normalized corpus', async () => {
    const document = authored('v3');
    document.label.en = ['x'.repeat(32 * 1024 * 1024)];
    await mustBlock(() => run(document, authored('v3')));
  }, 15_000);
});
