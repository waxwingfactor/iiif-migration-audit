import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { demo } from '../../src/web/demo';

interface FileGateWindow extends Window {
  __iiifPendingReads: number;
  __iiifReleaseReads: () => Promise<void>;
}

async function installFileReadGate(page: Page) {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    const pending: Array<() => Promise<void>> = [];
    const controlled = window as FileGateWindow;
    controlled.__iiifPendingReads = 0;
    controlled.__iiifReleaseReads = async () => {
      await Promise.all(pending.splice(0).map((release) => release()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    };
    File.prototype.arrayBuffer = function () {
      if (!this.name.startsWith('delayed-')) return original.call(this);
      controlled.__iiifPendingReads += 1;
      return new Promise<ArrayBuffer>((resolve, reject) => {
        pending.push(async () => {
          try {
            resolve(await original.call(this));
          } catch (error) {
            reject(error);
          } finally {
            controlled.__iiifPendingReads -= 1;
          }
        });
      });
    };
  });
}

async function releaseFileReads(page: Page) {
  await page.evaluate(() => (window as FileGateWindow).__iiifReleaseReads());
}

async function expectPendingFileRead(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as FileGateWindow).__iiifPendingReads))
    .toBe(1);
}

test('example supports review, source provenance, a reversible decision and offline exports', async ({
  page,
}) => {
  const unexpectedNetwork: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/'))
      unexpectedNetwork.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Compare manifests', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Explore an example' }).click();
  await expect(page.locator('#result-title')).toHaveText(
    /Preservation changes need attention|Changes need review/,
  );
  await expect(page.locator('.finding-row')).toHaveCount(3);
  await page
    .getByRole('button', { name: /Inspect source/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('alder-notebook-before.json');
  const excerpt = page.getByRole('region', { name: 'Source JSON excerpt' });
  await excerpt.focus();
  await expect(excerpt).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByLabel('Is this change intentional?')
    .fill('Reviewed against the catalog; intentional for this release.');
  await page.getByRole('button', { name: 'Accept with reason' }).click();
  await expect(page.getByText('Accepted as an intentional change', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen this finding' }).click();
  await expect(page.getByLabel('Is this change intentional?')).toBeVisible();
  await page.getByRole('tab', { name: /Page sequence/ }).click();
  await expect(page.locator('.pair-table tbody tr')).toHaveCount(4);
  await expect(page.locator('.sequence-moved')).toHaveCount(2);
  await page.getByRole('tab', { name: /Coverage/ }).click();
  await expect(page.getByText('The declared comparison profile was assessed')).toBeVisible();
  await page.getByText('Export report', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON evidence' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('iiif-audit.json');
  expect(unexpectedNetwork).toEqual([]);
});

test('file and paste changes invalidate old results; malformed data remains actionable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose baseline manifest').setInputFiles({
    name: 'before.json',
    mimeType: 'application/json',
    buffer: Buffer.from(demo.baseline.text),
  });
  await page.getByLabel('Choose candidate manifest').setInputFiles({
    name: 'after.json',
    mimeType: 'application/json',
    buffer: Buffer.from(demo.candidate.text),
  });
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page
    .locator('[aria-label="Candidate input method"]')
    .getByRole('button', { name: 'Paste' })
    .click();
  await page.getByLabel('Candidate manifest JSON').fill('{ broken JSON');
  await expect(page.locator('#result-title')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Comparison needs your attention');
  await expect(page.locator('#result-title')).toHaveCount(0);
});

test('unknown extensions stay incomplete and cannot be accepted into a pass', async ({ page }) => {
  const candidate = JSON.parse(demo.candidate.text) as Record<string, unknown>;
  candidate['custom:uninspected'] = { text: 'A meaningful extension' };
  await page.goto('/');
  await page.getByLabel('Choose baseline manifest').setInputFiles({
    name: 'before.json',
    mimeType: 'application/json',
    buffer: Buffer.from(demo.baseline.text),
  });
  await page.getByLabel('Choose candidate manifest').setInputFiles({
    name: 'after.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(candidate)),
  });
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toHaveText('Assessment is incomplete');
  await page.getByRole('tab', { name: /Coverage/ }).click();
  await expect(page.locator('.coverage-list')).toContainText('custom:uninspected');
  await expect(page.getByRole('button', { name: 'Accept with reason' })).toHaveCount(0);
});

test('hostile metadata remains inert in app and source inspector', async ({ page }) => {
  const baseline = JSON.parse(demo.baseline.text) as Record<string, unknown>;
  const payload =
    '</script><img src="https://malicious.example/collect" onerror="window.compromised=true">';
  baseline.description = payload;
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('malicious.example')) requests.push(request.url());
  });
  await page.goto('/');
  await page.getByLabel('Choose baseline manifest').setInputFiles({
    name: '<unsafe>.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(baseline)),
  });
  await page.getByLabel('Choose candidate manifest').setInputFiles({
    name: 'after.json',
    mimeType: 'application/json',
    buffer: Buffer.from(demo.candidate.text),
  });
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search findings' }).fill('malicious.example');
  const displayed = JSON.parse(await page.locator('.evidence-baseline pre').innerText()) as {
    none: string[];
  };
  expect(displayed.none[0]).toBe(payload);
  await page
    .getByRole('button', { name: /Inspect source/ })
    .first()
    .click();
  expect(JSON.parse(await page.getByRole('dialog').locator('pre').innerText())).toBe(payload);
  await expect(page.locator('img[src*="malicious.example"]')).toHaveCount(0);
  expect(await page.evaluate(() => 'compromised' in window)).toBe(false);
  expect(requests).toEqual([]);
});

test('core journeys have no serious accessibility violations and remain usable at narrow widths', async ({
  page,
}) => {
  await page.goto('/');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Explore an example' }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Compare manifests', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('tab', { name: /Page sequence/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('.pair-table')).toBeVisible();
});

test('review policy round-trips and stale decisions can be removed without editing JSON', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore an example' }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page
    .getByLabel('Is this change intentional?')
    .fill('The page order correction was verified by the collections reviewer.');
  await page.getByRole('button', { name: 'Accept with reason' }).click();
  await page.getByRole('button', { name: /Comparison policy/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export policy', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error('The exported policy could not be read.');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks);
  await page.reload();
  await page.getByLabel('Choose baseline manifest').setInputFiles({
    name: demo.baseline.name,
    mimeType: 'application/json',
    buffer: Buffer.from(demo.baseline.text),
  });
  await page.getByLabel('Choose candidate manifest').setInputFiles({
    name: demo.candidate.name,
    mimeType: 'application/json',
    buffer: Buffer.from(demo.candidate.text),
  });
  await page.getByRole('button', { name: /Comparison policy/ }).click();
  await page
    .getByLabel('Import comparison policy')
    .setInputFiles({ name: 'review-policy.json', mimeType: 'application/json', buffer: exported });
  await expect(page.locator('.policy-footer')).toContainText('1 review decision');
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('.result-summary')).toContainText('1 accepted');
  await page
    .locator('[aria-label="Candidate input method"]')
    .getByRole('button', { name: 'Paste' })
    .click();
  await page.getByLabel('Candidate manifest JSON').fill(`${demo.candidate.text}\n`);
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toHaveText('Assessment is incomplete');
  await page.locator('.saved-decisions summary').click();
  await page.getByRole('button', { name: /Remove saved decision/ }).click();
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toHaveText('Preservation changes need attention');
  await expect(page.locator('.result-summary')).toContainText('0 accepted');
});

test('UTF-8 BOM files retain the same exact evidence hash as the CLI', async ({ page }) => {
  const text = `\uFEFF${demo.baseline.text}`;
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  await page.goto('/');
  await page.getByLabel('Choose baseline manifest').setInputFiles({
    name: 'before-with-bom.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text, 'utf8'),
  });
  await page.getByLabel('Choose candidate manifest').setInputFiles({
    name: demo.candidate.name,
    mimeType: 'application/json',
    buffer: Buffer.from(demo.candidate.text),
  });
  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page.getByRole('tab', { name: /Coverage/ }).click();
  await expect(page.locator('.report-provenance')).toContainText(hash);
  await page.getByRole('tab', { name: /Findings/ }).click();
  await page
    .getByRole('button', { name: /Inspect source/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).not.toContainText('source excerpt is unavailable');
  const excerpt = await page.getByRole('dialog').locator('pre').innerText();
  expect(() => JSON.parse(excerpt)).not.toThrow();
});

for (const side of ['baseline', 'candidate'] as const) {
  test(`a delayed ${side} import cannot replace newer demo, paste, clear or file choices`, async ({
    page,
  }) => {
    await installFileReadGate(page);
    await page.goto('/');
    const panel = page.locator('.input-panel').nth(side === 'baseline' ? 0 : 1);
    const chooser = page.getByLabel(`Choose ${side} manifest`);
    const source = demo[side];
    for (const intent of ['demo', 'paste', 'clear', 'file'] as const) {
      await page.getByRole('button', { name: 'Explore an example' }).click();
      await expect(page.locator('#result-title')).toBeVisible();
      await chooser.setInputFiles({
        name: `delayed-${side}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(source.text),
      });
      await expectPendingFileRead(page);
      if (intent === 'demo') {
        // Values are deliberately identical: a reset must have its own generation.
        await page.getByRole('button', { name: 'Explore an example' }).click();
        await expect(page.locator('#result-title')).toBeVisible();
      } else if (intent === 'file') {
        await panel.getByRole('button', { name: 'File', exact: true }).click();
        await chooser.setInputFiles({
          name: `fresh-${side}.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(source.text),
        });
        await expect(panel.locator('.file-name')).toHaveText(`fresh-${side}.json`);
      } else {
        await panel.getByRole('button', { name: 'Paste', exact: true }).click();
        if (intent === 'paste') await panel.locator('textarea').fill(`${source.text}\n`);
        else await panel.getByRole('button', { name: 'Clear', exact: true }).click();
      }
      await releaseFileReads(page);
      if (intent === 'demo') {
        await expect(page.locator('#result-title')).toBeVisible();
        await expect(panel.locator('.file-name')).toHaveText(source.name);
      } else if (intent === 'file')
        await expect(panel.locator('.file-name')).toHaveText(`fresh-${side}.json`);
      else
        await expect(panel.locator('textarea')).toHaveValue(
          intent === 'paste' ? `${source.text}\n` : '',
        );
    }
  });
}

test('delayed policy imports cannot override newer rules, decisions, imports or demo resets', async ({
  page,
}) => {
  await installFileReadGate(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore an example' }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page.getByRole('button', { name: /Comparison policy/ }).click();
  const chooser = page.getByLabel('Import comparison policy');
  const empty = { schemaVersion: '1.0', uriRules: [], acceptedChanges: [] };
  const oldRule = {
    scope: 'image-service',
    fromPrefix: 'https://obsolete.example/images/',
    toPrefix: 'https://replacement.example/images/',
  };
  const startOldImport = async (policy: unknown) => {
    await chooser.setInputFiles({
      name: 'delayed-policy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(policy)),
    });
    await expectPendingFileRead(page);
  };
  await startOldImport(empty);
  await page.getByRole('button', { name: '+ Add URL rule', exact: true }).click();
  await releaseFileReads(page);
  await expect(page.getByLabel('Baseline prefix')).toHaveCount(1);
  await startOldImport(empty);
  await page.getByLabel('Baseline prefix').fill('https://newer.example/images/');
  await releaseFileReads(page);
  await expect(page.getByLabel('Baseline prefix')).toHaveValue('https://newer.example/images/');
  await startOldImport({ ...empty, uriRules: [oldRule] });
  await page.getByRole('button', { name: 'Remove URL rule 1' }).click();
  await releaseFileReads(page);
  await expect(page.getByLabel('Baseline prefix')).toHaveCount(0);

  await page.getByRole('button', { name: 'Compare manifests', exact: true }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await page.getByLabel('Is this change intentional?').fill('This is the newer reviewed decision.');
  await page.getByRole('button', { name: 'Accept with reason' }).click();
  const fingerprint = await page.locator('.finding-code span').getAttribute('title');
  await startOldImport({
    ...empty,
    acceptedChanges: [{ findingId: fingerprint, reason: 'Obsolete decision' }],
  });
  await page.locator('.saved-decisions summary').click();
  await page.getByRole('button', { name: /Remove saved decision/ }).click();
  await releaseFileReads(page);
  await expect(page.locator('.policy-footer')).toContainText('0 review decisions');

  await startOldImport({ ...empty, uriRules: [oldRule] });
  await page.getByRole('button', { name: 'Explore an example' }).click();
  await expect(page.locator('#result-title')).toBeVisible();
  await releaseFileReads(page);
  await expect(page.locator('#result-title')).toBeVisible();
  await page.getByRole('button', { name: /Comparison policy/ }).click();
  await expect(page.getByLabel('Baseline prefix')).toHaveCount(0);
  await startOldImport({ ...empty, uriRules: [oldRule] });
  await chooser.setInputFiles({
    name: 'newer-policy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(empty)),
  });
  await releaseFileReads(page);
  await expect(page.getByLabel('Baseline prefix')).toHaveCount(0);
});
