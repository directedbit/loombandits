// Drives the built app in the installed Chrome at a phone viewport: set up a squad, play the
// start of a game, make a sub, reload, go offline, read the summary. Screenshots land in
// e2e/screenshots/. Fails on any page error or unexpected screen.
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const base = process.env.BASE_URL ?? 'http://localhost:4173/loombandits/';
const shots = 'e2e/screenshots';
await rm(shots, { recursive: true, force: true });
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

// Settings: a nine-player squad (eight defaults plus one), seven on the field, two per sub.
await page.getByRole('link', { name: 'Settings', exact: true }).click();
await expect(page.getByLabel('Rotation'), 'rotation setting');
await expect(page.getByText(/subs a period/), 'sub plan readout');
await shot('settings-top');
for (const name of ['Maya']) {
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

// Set the order: the second card in each column moves to the top, so she is first off / on.
const columnNames = async (column) => page.locator(`.${column} .card .name`).allTextContents();
const fieldBefore = await columnNames('field');
await page.locator('.field .card').nth(1).getByRole('button').first().click();
await page.getByRole('button', { name: '▲ Earlier' }).click();
const fieldAfter = await columnNames('field');
if (fieldAfter[0] !== fieldBefore[1] || fieldAfter[1] !== fieldBefore[0]) {
  await shot('FAILED');
  throw new Error(`expected ${fieldBefore[1]} first off, got ${fieldAfter.join(', ')}`);
}
const benchBefore = await columnNames('bench');
await page.locator('.bench .card').nth(1).getByRole('button').first().click();
await page.getByRole('button', { name: '▲ Earlier' }).click();
const benchAfter = await columnNames('bench');
if (benchAfter[0] !== benchBefore[1]) {
  await shot('FAILED');
  throw new Error(`expected ${benchBefore[1]} first on, got ${benchAfter.join(', ')}`);
}
await shot('ordered');

// Kick off, let the clock run, sub early.
await page.getByRole('button', { name: 'Start period 1' }).click();
await expect(page.getByText(/Period 1 of \d/), 'running header');
await page.waitForTimeout(1500);
await expect(page.getByText('NEXT ON'), 'next-on badge');
await expect(page.getByText('NEXT OFF'), 'next-off badge');
await shot('running');
// The first swap follows the order set before kick-off.
const firstOff = page.locator('.field .card.off .name');
if ((await firstOff.first().textContent()) !== fieldAfter[0]) {
  await shot('FAILED');
  throw new Error(`expected ${fieldAfter[0]} to be next off`);
}
await page.getByRole('button', { name: /Sub (early|now)/ }).click();
await page.waitForTimeout(600);
await shot('after-sub');

// Sub two players who are not next up: "Sub ... next" moves each to the front of her column,
// the badge and the sub line follow, and the change is to the order itself.
const lastField = page.locator('.field .card').last();
const promotedOff = await lastField.locator('.name').textContent();
await lastField.getByRole('button').first().click();
await page.getByRole('button', { name: 'Sub off next' }).click();
const lastBench = page.locator('.bench .card').last();
const promotedOn = await lastBench.locator('.name').textContent();
await lastBench.getByRole('button').first().click();
await page.getByRole('button', { name: 'Sub on next' }).click();
const fieldOrder = await columnNames('field');
const benchOrder = await columnNames('bench');
if (fieldOrder[0] !== promotedOff || benchOrder[0] !== promotedOn) {
  await shot('FAILED');
  throw new Error(
    `expected ${promotedOff} / ${promotedOn} at the front, got ${fieldOrder[0]} / ${benchOrder[0]}`,
  );
}
if ((await page.locator('.field .card.off .name').first().textContent()) !== promotedOff) {
  await shot('FAILED');
  throw new Error(`expected the NEXT OFF badge on ${promotedOff}`);
}
await shot('promoted');
await page.getByRole('button', { name: /Sub (early|now)/ }).click();
await page.waitForTimeout(300);
// Two per sub: the two at the front of each column swapped and joined the back of the other
// column in that order; nobody else moved.
const expectField = [...fieldOrder.slice(2), ...benchOrder.slice(0, 2)];
const expectBench = [...benchOrder.slice(2), ...fieldOrder.slice(0, 2)];
const fieldNow = await columnNames('field');
const benchNow = await columnNames('bench');
if (fieldNow.join() !== expectField.join() || benchNow.join() !== expectBench.join()) {
  await shot('FAILED');
  throw new Error(
    `order after the sub: field ${fieldNow.join(', ')} (expected ${expectField.join(', ')}); ` +
      `bench ${benchNow.join(', ')} (expected ${expectBench.join(', ')})`,
  );
}

// The order can still be changed in play: move the second field card up one place.
await page.locator('.field .card').nth(1).getByRole('button').first().click();
await page.getByRole('button', { name: '▲ Earlier' }).click();
const reordered = await columnNames('field');
if (reordered[0] !== fieldNow[1] || reordered[1] !== fieldNow[0]) {
  await shot('FAILED');
  throw new Error(`expected ${fieldNow[1]} first off after Earlier, got ${reordered.join(', ')}`);
}
await page.locator('.field .card').first().getByRole('button').first().click(); // collapse

// The half is cut short: −30s shortens the period, keeps the minutes and re-plans the subs.
const clock = page.locator('.hdr .big').first();
const nextSub = page.locator('.hdr .big').nth(1);
const toSeconds = (t) => {
  const [m, sec] = t.trim().split(':').map(Number);
  return m * 60 + sec;
};
const beforeRemaining = toSeconds(await clock.textContent());
const beforeNext = toSeconds(await nextSub.textContent());
await page.getByRole('button', { name: 'Take 30 seconds off the period' }).click();
await page.waitForTimeout(300);
const afterRemaining = toSeconds(await clock.textContent());
const afterNext = toSeconds(await nextSub.textContent());
if (afterRemaining > beforeRemaining - 25) {
  await shot('FAILED');
  throw new Error(`expected −30s to shorten the half: ${beforeRemaining} → ${afterRemaining}`);
}
// 9 players, 7 on, 2 per sub: 5 slots a period, so the interval drops from 3:00 to 2:54.
if (afterNext >= beforeNext) {
  await shot('FAILED');
  throw new Error(`expected the next sub to move closer: ${beforeNext} → ${afterNext}`);
}
await expect(page.getByText('14:30'), 'period length shown');
await shot('period-shortened');
await page.getByRole('button', { name: 'Add 30 seconds to the period' }).click();
await page.waitForTimeout(300);
if (toSeconds(await clock.textContent()) < afterRemaining + 25) {
  await shot('FAILED');
  throw new Error('expected +30s to put the time back');
}

// State survives a reload.
await page.reload();
await expect(page.getByText(/Period 1 of \d/), 'game restored after reload');

// Works offline once the service worker is in charge.
await page.evaluate(() => navigator.serviceWorker.ready);
await ctx.setOffline(true);
await page.reload();
await expect(page.getByText(/Period 1 of \d/), 'game loads offline');
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
