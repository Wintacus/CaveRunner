/**
 * Verifies the haptics call path end to end.
 *
 * Stubs navigator.vibrate before the game boots (headless Chromium doesn't implement it),
 * then drives the real game into a pit death and through a checkpoint, and reports whether
 * a vibration was actually requested. This distinguishes "our code never calls it" from
 * "the browser has no Vibration API".
 *
 * Usage: node tools/haptics-probe.mjs [--url http://localhost:4173]
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const url = arg('url', 'http://localhost:4173');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

// Stub the Vibration API and record every request.
await page.addInitScript(() => {
  window.__vibrations = [];
  window.__hasNativeVibrate = typeof navigator.vibrate === 'function';
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    writable: true,
    value: (pattern) => {
      window.__vibrations.push(pattern);
      return true;
    }
  });
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.scene.getScene('Menu')?.scene.isActive());
await page.mouse.click(480, 270);
await page.waitForFunction(() => window.__game?.scene.getScene('Game')?.scene.isActive());

const result = await page.evaluate(async (frameMs) => {
  const g = window.__game;
  const scene = g.scene.getScene('Game');
  g.loop.stop();
  const realRender = g.scene.render.bind(g.scene);
  g.scene.render = () => scene.cameras?.main?.preRender();

  const step = (n) => {
    for (let i = 0; i < n; i++) {
      window.__t = (window.__t || 0) + frameMs;
      g.step(window.__t, frameMs);
    }
  };

  const marks = {};

  // 1. Pit death -> haptics.hit()
  scene.player.body.reset(scene.player.x, scene.map.heightInPixels - 20);
  step(10);
  await new Promise((r) => setTimeout(r, 50));
  marks.afterDeath = window.__vibrations.length;

  // Let the respawn complete.
  step(90);
  await new Promise((r) => setTimeout(r, 50));

  // 2. Checkpoint -> haptics.checkpoint()
  const cp = scene.director.defs.find((d) => d.type === 'checkpoint');
  scene.player.body.reset(cp.x - 200, cp.y - 40);
  scene.cameras.main.setScroll(cp.x - 500, 0);
  step(180);
  await new Promise((r) => setTimeout(r, 50));
  marks.afterCheckpoint = window.__vibrations.length;

  g.scene.render = realRender;
  return {
    hasNativeVibrate: window.__hasNativeVibrate,
    vibrations: window.__vibrations,
    marks,
    deaths: scene.deaths,
    checkpointX: Math.round(scene.checkpoint.x)
  };
}, 1000 / 60);

console.log(JSON.stringify(result, null, 2));
await browser.close();

const ok = result.vibrations.length > 0;
console.log(ok ? '\nhaptics path reaches the Vibration API' : '\nNO vibration was ever requested — the call path is broken');
process.exit(ok ? 0 : 1);
