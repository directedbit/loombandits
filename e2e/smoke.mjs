// Drives the built app in the installed Chrome at a phone viewport: set up a squad, play the
// start of a game, make a sub, reload, go offline, read the summary. Screenshots land in
// e2e/screenshots/. Fails on any page error or unexpected screen.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.BASE_URL ?? 'http://localhost:4173/loombandits/';
const shots = 'e2e/screenshots';
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('dialog', (d) => d.accept());

let step = 0;
const shot = async (name) => {
  step += 1;
  await page.screenshot({ path: `${shots}/${String(step).padStart(2, '0')}-${name}.png` });
};
const expect = async (locator, what) => {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    await shot('FAILED');
    throw new Error(`expected ${what}`);
  }
};

await page.goto(base);
await expect(page.getByRole('button', { name: 'New game' }), 'start screen');
await shot('start');

// Settings: a nine-player squad, seven on the field, two per sub.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
for (const name of ['Maya', 'Zoe', 'Ella', 'Ivy', 'Lucy']) {
  await page.getByPlaceholder('Add a player').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}
await page.getByLabel('Players on field').fill('7');
await page.getByLabel('Players on field').dispatchEvent('change');
await page.getByLabel('Swapped per sub').fill('2');
await page.getByLabel('Swapped per sub').dispatchEvent('change');
await expect(page.getByText('Players (9)'), 'nine players');
await shot('settings');

// New game: everyone available, seven on the field.
await page.getByRole('link', { name: 'Game', exact: true }).click();
await page.getByRole('button', { name: 'New game' }).click();
await expect(page.getByRole('button', { name: 'Start period 1' }), 'pre-game board');
// The one-off "ready to work offline" notice must not block the controls.
const okButton = page.getByRole('button', { name: 'OK', exact: true });
if (await okButton.isVisible()) await okButton.click();
await expect(page.getByText('7/7'), 'seven on the field');
await shot('pre-game');

// Mark one player as not playing from the sideline, then bring her back.
await page
  .getByRole('button', { name: /^2 .* 0:00$/ })
  .first()
  .click();
await page.getByRole('button', { name: '✕ Not playing' }).click();
await expect(page.getByText('Not playing 1'), 'one not playing');
await page.getByRole('button', { name: 'Undo' }).click();
await expect(page.getByText('Not playing 0'), 'undo restored her');

// Kick off, let the clock run, sub early.
await page.getByRole('button', { name: 'Start period 1' }).click();
await expect(page.getByText('Period 1 of 4'), 'running header');
await page.waitForTimeout(1500);
await expect(page.getByText('NEXT ON'), 'next-on badge');
await expect(page.getByText('NEXT OFF'), 'next-off badge');
await shot('running');
await page.getByRole('button', { name: /Sub (early|now)/ }).click();
await page.waitForTimeout(600);
await shot('after-sub');

// State survives a reload.
await page.reload();
await expect(page.getByText('Period 1 of 4'), 'game restored after reload');

// Works offline once the service worker is in charge.
await page.evaluate(() => navigator.serviceWorker.ready);
await ctx.setOffline(true);
await page.reload();
await expect(page.getByText('Period 1 of 4'), 'game loads offline');
await shot('offline');
await ctx.setOffline(false);

// Pause, end the period, check the summary.
await page.getByRole('button', { name: 'Pause' }).click();
await expect(page.getByText('paused'), 'paused label');
await page.getByRole('button', { name: 'End period' }).click();
await expect(page.getByRole('button', { name: 'Start period 2' }), 'break controls');
await shot('break');
await page.getByRole('link', { name: 'Summary', exact: true }).click();
await expect(page.getByRole('button', { name: 'Copy as text' }), 'summary');
await shot('summary');

await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`smoke test passed, ${step} screenshots in ${shots}/`);
