/**
 * Headless smoke test.
 *
 * Boots the built game in Chromium, taps through the start screen, plays for a few
 * seconds, and fails on any console error / page exception. Also writes screenshots to
 * tools/shots/ for eyeballing.
 *
 * Usage: node tools/smoke-test.mjs [--url http://localhost:4173] [--seconds 12]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const url = arg('url', 'http://localhost:4173');
const seconds = Number(arg('seconds', 12));
const shotDir = path.resolve('tools/shots');
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 }, // iPhone-ish landscape
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true
});
const page = await context.newPage();

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
});

await page.goto(url, { waitUntil: 'load' });

/** Convert game-space coordinates (960x540) to page coordinates on the letterboxed canvas. */
const toPage = async (gx, gy) =>
  page.evaluate(
    ([x, y]) => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return [r.left + (x / 960) * r.width, r.top + (y / 540) * r.height];
    },
    [gx, gy]
  );
const tap = async (gx, gy) => {
  const [x, y] = await toPage(gx, gy);
  await page.mouse.click(x, y);
};
const holdAt = async (gx, gy, ms) => {
  const [x, y] = await toPage(gx, gy);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
};
await page.waitForTimeout(2500); // boot -> preload -> menu
await page.screenshot({ path: path.join(shotDir, '01-menu.png') });

// Start the run.
await tap(480, 270);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(shotDir, '02-start.png') });

// Play: hold-jump every ~900ms, mixing short taps and long holds.
const end = Date.now() + seconds * 1000;
let i = 0;
while (Date.now() < end) {
  const hold = i % 3 === 0 ? 60 : 260;
  await holdAt(480, 320, hold);
  await page.waitForTimeout(900 - hold);
  if (i === 4) await page.screenshot({ path: path.join(shotDir, '03-run.png') });
  i++;
}
await page.screenshot({ path: path.join(shotDir, '04-later.png') });

// Pause button (top-right, inside the safe area).
await tap(912, 48);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(shotDir, '05-paused.png') });
await tap(480, 297); // RESUME
await page.waitForTimeout(600);

const stats = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return null;
  const scene = g.scene.getScene('Game');
  return scene
    ? {
        state: scene.state,
        playerX: Math.round(scene.player.x),
        score: scene.score,
        deaths: scene.deaths,
        pooled: scene.director.poolSize,
        fps: Math.round(g.loop.actualFps)
      }
    : null;
});

console.log('stats:', JSON.stringify(stats));
console.log(`screenshots -> ${path.relative(process.cwd(), shotDir)}`);

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} runtime error(s):`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log('no runtime errors');
