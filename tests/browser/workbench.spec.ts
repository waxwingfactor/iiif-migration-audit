import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demo } from '../../src/web/demo';

test('example supports review, source provenance, a reversible decision and offline exports', async ({
  page,
}) => {
  const unexpectedNetwork: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:4173/') &&
      !request.url().startsWith('ws://127.0.0.1:4173/')
    )
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
  await page.getByRole('tab', { name: /Coverage & scope/ }).click();
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
  await page.getByRole('tab', { name: /Coverage & scope/ }).click();
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
  await expect(page.locator('.finding-detail')).toContainText(payload);
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
