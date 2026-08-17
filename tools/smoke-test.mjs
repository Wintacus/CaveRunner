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
import { ENTITIES } from '../src/level/level1.js';

// Read from the level rather than hand-copied here: this list went stale the moment a
// fourth checkpoint was added, and a marker check that silently skips the new marker is
// worse than no check.
const MARKER_TILES = ENTITIES.filter((e) => e.type === 'checkpoint' || e.type === 'goal')
  .map((e) => e.x)
  .sort((a, b) => a - b);

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

/**
 * The full-screen button must not be able to cost the player anything.
 *
 * Two ways it could, both found by building it. Phaser's input listens on `window` as well
 * as on the canvas, so a tap on a DOM control sitting over the game reaches the game too
 * and reads as a jump unless the event is stopped at the button. And a full-screen element
 * is promoted to the browser's top layer, where *only it and its descendants* are painted
 * and hit-tested — so a button that is a sibling of `#game` rather than a child of it is
 * not merely behind the game while full screen, it is unreachable, which strands the
 * player with no way back out.
 */
const fsBtn = await page.evaluate(() => {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return null;
  return {
    insideGame: document.getElementById('game')?.contains(btn) === true,
    available: window.__game.scale.fullscreen.available,
    hidden: btn.hidden
  };
});
if (!fsBtn) {
  console.error('\nfull-screen button check failed: #fullscreen-btn is missing');
  await browser.close();
  process.exit(1);
}
const sceneKeys = () => page.evaluate(() => ({ menu: window.__game.scene.isActive('Menu'), game: window.__game.scene.isActive('Game') }));
const before = await sceneKeys();
await page.tap('#fullscreen-btn');
await page.waitForTimeout(700);
const after = await sceneKeys();
const fsState = await page.evaluate(() => ({
  isFullscreen: window.__game.scale.isFullscreen,
  element: document.fullscreenElement?.id ?? null,
  canvasStillInGame: document.querySelector('canvas').parentElement?.id === 'game'
}));
const leaked = before.menu && after.game;
const problems = [];
if (!fsBtn.insideGame) problems.push('the button is outside #game, so it vanishes in full screen');
if (fsBtn.hidden) problems.push('the button is hidden on the menu, where it is meant to be offered');
if (leaked) problems.push('tapping the button also reached the game as a jump and started the run');
if (fsBtn.available && !fsState.isFullscreen) problems.push('the API is available but the tap did not enter full screen');
if (fsState.isFullscreen && fsState.element !== 'game') problems.push(`full screen went to "${fsState.element}" rather than #game`);
if (!fsState.canvasStillInGame) problems.push('the canvas was reparented out of #game');

/**
 * And the same button on a browser with no Fullscreen API at all — iPhone Safari, where
 * element full screen only shipped in 17.2/17.4 and is absent on anything older.
 *
 * This is the bug that reached the player. The button used to hide itself whenever the API
 * was missing, which meant it disappeared on precisely the device it was built for; the
 * report back was "I don't see that button at all". It must now stay, and explain the route
 * that does work. Phaser probes for the API at module-load time, so it has to be deleted
 * before any script on the page runs.
 */
const bareContext = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
});
await bareContext.addInitScript(() => {
  for (const p of ['requestFullscreen', 'requestFullScreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen',
    'msRequestFullscreen', 'msRequestFullScreen', 'mozRequestFullScreen', 'mozRequestFullscreen']) {
    try { Object.defineProperty(Element.prototype, p, { value: undefined, configurable: true }); } catch { /* not deletable */ }
  }
});
const barePage = await bareContext.newPage();
await barePage.goto(url, { waitUntil: 'load' });
await barePage.waitForTimeout(3000);
const bare = await barePage.evaluate(() => {
  const b = document.getElementById('fullscreen-btn');
  const r = b.getBoundingClientRect();
  return {
    reportedAvailable: window.__game.scale.fullscreen.available,
    buttonVisible: !b.hidden && r.width > 0 && r.height > 0,
    // Bottom-right, not stranded in the corner by a safe-area calc the browser could not parse.
    inLowerRight: r.x > window.innerWidth / 2 && r.y > window.innerHeight / 2
  };
});
if (bare.reportedAvailable) {
  problems.push('the no-API simulation failed to remove the Fullscreen API, so the fallback went untested');
} else {
  if (!bare.buttonVisible) problems.push('with no Fullscreen API the button hides itself — this is the bug that shipped');
  if (!bare.inLowerRight) problems.push('with no Fullscreen API the button is not in the lower-right corner');
}
await bareContext.close();

console.log(
  `full-screen button: entered=${fsState.isFullscreen}, input leak=${leaked ? 'YES' : 'no'}, ` +
    `visible without API=${bare.buttonVisible}, problems=${problems.length}`
);
if (problems.length) {
  console.error('\nfull-screen button check failed:');
  problems.forEach((p) => console.error(`  ${p}`));
  await browser.close();
  process.exit(1);
}
// Back out, so the rest of the run measures the ordinary windowed layout.
if (fsState.isFullscreen) {
  await page.tap('#fullscreen-btn');
  await page.waitForTimeout(700);
}

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

/**
 * SPRITE_SIZES has to describe every texture the game actually makes.
 *
 * It is the list a replacement art pack gets generated against, and the hand-maintained
 * version had gone quietly wrong: six of ten entries disagreed with the texture produced,
 * thirteen keys were missing, and the character entries gave the art size while the texture
 * is 16px larger on each axis to leave room for the glow. It is now filled in as the
 * textures are drawn; this checks that nothing is missing and that the map is honest.
 */
const sizes = await page.evaluate(() => {
  const t = window.__game.scene.getScene('Game').textures;
  return Object.entries(window.__spriteSizes || {}).map(([key, wh]) => {
    const src = t.exists(key) && t.get(key).getSourceImage();
    return { key, declared: wh, actual: src ? [src.width, src.height] : null };
  });
});
const sizeProblems = sizes.filter((s) => !s.actual || s.actual[0] !== s.declared[0] || s.actual[1] !== s.declared[1]);
console.log(`sprite sizes checked: ${sizes.length}, mismatched: ${sizeProblems.length}`);
if (sizes.length < 20 || sizeProblems.length) {
  console.error('\nSPRITE_SIZES check failed:');
  if (sizes.length < 20) console.error(`  only ${sizes.length} textures recorded, expected every key`);
  sizeProblems.forEach((s) => console.error(`  ${s.key}: declared ${s.declared}, actual ${s.actual}`));
  await browser.close();
  process.exit(1);
}

/**
 * Markers have to be impossible to jump over.
 *
 * A checkpoint or goal is a trigger, and its reach is a property of the sprite body rather
 * than of the level data, so the level validator cannot see it. It matters: both used to be
 * short columns standing on the floor while a full-hold jump carries the runner 190px up,
 * so a committed jump sailed clean over either. Over the goal that is fatal — the trigger
 * never fires, the level simply ends and the runner falls off the far side of the last
 * platform instead of winning.
 */
const markers = await page.evaluate((MARKER_TILES) => {
  const scene = window.__game.scene.getScene('Game');
  const out = [];
  const TILE = 32;
  let t = 0;
  for (const tile of MARKER_TILES) {
    scene.player.setFrozen(true);
    scene.player.setPosition((tile - 8) * TILE, 13 * TILE);
    scene.director.rewindTo((tile - 8) * TILE);
    scene.cameras.main.setScroll((tile - 8) * TILE - 300, 0);
    for (let i = 0; i < 30; i++) { t += 16.67; window.__game.step(t, 16.67); }
    const e = [...scene.director.pools.values()].flatMap((p) => [...p.active])
      .find((x) => (x.def?.type === 'checkpoint' || x.def?.type === 'goal') && Math.round(x.def.x / TILE - 0.5) === tile);
    if (e) out.push({ type: e.def.type, tile, top: Math.round(e.body.top), surface: Math.round(e.def.y) });
  }
  return out;
}, MARKER_TILES);

// The runner's lowest point at the top of a full hold. Anything the trigger fails to reach
// is a height at which the player passes straight through the marker.
const APEX_PX = 190;
const missable = markers.filter((m) => m.top > m.surface - APEX_PX);
console.log(`markers checked: ${markers.length}, jumpable-over: ${missable.length}`);
if (markers.length < MARKER_TILES.length || missable.length) {
  console.error('\nmarker trigger check failed:');
  if (markers.length < MARKER_TILES.length)
    console.error(`  only found ${markers.length} of ${MARKER_TILES.length} markers`);
  missable.forEach((m) => console.error(`  ${m.type} at tile ${m.tile}: trigger starts at y=${m.top}, player clears it at y=${m.surface - APEX_PX}`));
  await browser.close();
  process.exit(1);
}

console.log(`screenshots -> ${path.relative(process.cwd(), shotDir)}`);

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} runtime error(s):`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
console.log('no runtime errors');
