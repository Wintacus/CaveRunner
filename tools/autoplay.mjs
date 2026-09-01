/**
 * Deterministic full-level autoplay.
 *
 * Stops Phaser's RAF loop and steps the *real* game by hand at a fixed delta, driving the
 * player with a scripted bot that reads the tilemap ahead of itself. That exercises the
 * whole level — streaming, pooling, checkpoints, respawns, the goal — in seconds and with
 * no dependence on how fast the headless renderer happens to be.
 *
 * It is a traversal check, not a fun check: the bot handles terrain and static hazards,
 * and its creature dodging is crude, so its death count is a rough signal only.
 *
 * Usage: node tools/autoplay.mjs [--url http://localhost:4173] [--fps 60]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const url = arg('url', 'http://localhost:4173');
const fps = Number(arg('fps', 60));
const shotDir = path.resolve('tools/shots');
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.scene.getScene('Menu')?.scene.isActive(), null, { timeout: 15000 });
await page.mouse.click(480, 270);
await page.waitForFunction(() => window.__game?.scene.getScene('Game')?.scene.isActive(), null, { timeout: 15000 });

const result = await page.evaluate(async (frameMs) => {
  const g = window.__game;
  const scene = g.scene.getScene('Game');
  g.loop.stop();

  // Skip rasterisation while simulating: the software renderer in a headless browser is
  // ~50x slower than the game logic, and nothing here looks at pixels. The camera's
  // follow/scroll maths lives in Camera.preRender, though, so that one piece has to be
  // driven by hand — without it the camera never scrolls and nothing streams in.
  const realRender = g.scene.render.bind(g.scene);
  g.scene.render = () => scene.cameras?.main?.preRender();

  const TILE = 32;
  const log = [];
  const deathsAt = [];
  let lastDeaths = 0;

  const solid = (x, y) => {
    const t = scene.ground.getTileAtWorldXY(x, y);
    return !!(t && t.collides);
  };
  /** Surface height under a world x, or null over a pit. */
  const surfaceAt = (x, fromY) => {
    for (let y = fromY - 96; y < scene.map.heightInPixels; y += TILE / 2) if (solid(x, y)) return y;
    return null;
  };

  const bot = { holdMs: 0, rng: 1 };
  let attempt = 0;
  // Tiny deterministic jitter. Creature patterns are (by design) identical on every
  // approach, so a bot that fails a beat would fail it forever; a frame of wobble lets it
  // eventually get through instead of looping.
  const jitter = () => {
    bot.rng = (bot.rng * 1103515245 + 12345) % 2147483648;
    return bot.rng / 2147483648;
  };

  // Read the run speed off the live body rather than hardcoding it, so the bot's
  // arrival-time predictions stay correct when the game's speed is retuned.
  const RUN = Math.abs(scene.player.body.velocity.x) || 330;
  const BODY_H = 34;

  const decide = (dt) => {
    const p = scene.player;
    if (bot.holdMs > 0) {
      bot.holdMs -= dt;
      if (bot.holdMs <= 0) p.releaseJump();
    }
    if (!p.onGround || scene.state !== 'running') return;

    const feet = p.y + 17;
    const ahead = p.x + 22;

    // 1. Terrain: where does the floor stop, and what is on the other side?
    let edge = null;
    for (let d = 0; d < 260; d += 8) {
      if (surfaceAt(ahead + d, feet) === null) {
        edge = ahead + d;
        break;
      }
    }

    // 2. Static hazards on the ground in front of us.
    //
    // `big` matters: a big-spike ridge is 66px tall and three of them overlap into ~156px
    // of obstacle, so it needs an earlier take-off and a much longer hold than the hop that
    // clears a 15px spike. Answering both with one fixed hop is how the bot ended up
    // walking into the ridge twenty times in a row.
    let hazardDist = Infinity;
    let hazardBig = false;
    for (const pool of scene.director.pools.values()) {
      for (const e of pool.active) {
        const type = e.def.type;
        if (type !== 'stalagmite' && type !== 'spike' && type !== 'bigspike') continue;
        const d = e.x - p.x;
        if (d > 0 && d < 260) {
          if (d < hazardDist) hazardBig = type === 'bigspike';
          hazardDist = Math.min(hazardDist, d);
        }
      }
    }

    // 3. Creatures: predict where each one will be when we get there, and only treat it
    //    as a threat if it will actually be in our lane at that moment.
    let creatureDist = Infinity;
    for (const pool of scene.director.pools.values()) {
      for (const e of pool.active) {
        if (!e.predictY) continue;
        const d = e.x - p.x;
        if (d <= 0 || d > 420) continue;
        const eta = (d / RUN) * 1000;
        const y = e.predictY(eta);
        const blocksLane = y + 12 > feet - BODY_H && y - 12 < feet;
        if (blocksLane) creatureDist = Math.min(creatureDist, d);
      }
    }

    if (edge !== null && edge - p.x < 74 + jitter() * 8) {
      let landing = null;
      let gap = 0;
      for (let d = 8; d < 340; d += 8) {
        const s = surfaceAt(edge + d, feet);
        if (s !== null) {
          landing = s;
          gap = d;
          break;
        }
      }
      const rise = landing === null ? 0 : feet - landing;
      let hold = gap > 130 || rise > 40 ? 270 : gap > 90 ? 170 : 110;

      // A stalactite over the gap turns a wide pit into a corridor: the jump has to be long
      // enough to cross and low enough to pass under. The full hold that clears the gap on
      // its own drives the runner's head straight into the tip, which is exactly what those
      // hazards are placed to punish — so cap the hold when one hangs over the crossing.
      // Every jump carries at least ~192px of travel even from a bare tap, so a short hold
      // still clears any gap in this level; only the height has to come down.
      for (const pool of scene.director.pools.values()) {
        for (const e of pool.active) {
          if (e.def.type !== 'stalactite') continue;
          const d = e.x - p.x;
          if (d > -40 && d < 300) hold = Math.min(hold, 110);
        }
      }

      p.requestJump();
      bot.holdMs = hold;
      return;
    }

    // Hop over anything in the lane. Enough height to clear a low creature or a
    // stalagmite, not so much that we sail into whatever is above — except for a big-spike
    // ridge, which needs the committed jump it was built to demand.
    const trigger = hazardBig ? 150 + jitter() * 20 : 86;
    if (hazardDist < trigger || creatureDist < 80 + jitter() * 26) {
      p.requestJump();
      bot.holdMs = hazardBig && hazardDist < trigger ? 270 : 150;
    }
  };

  // Start from a known state so a run is reproducible, then allow a few attempts with
  // different input timing. Creature patterns are deliberately identical on every
  // approach, so a bot that mistimes one beat mistimes it forever; a human varies. What
  // this gate should assert is "the level can be completed", not "this exact policy wins
  // first try", so a stuck attempt restarts with a different jitter seed.
  const restart = () => {
    attempt += 1;
    bot.rng = attempt * 7919 + 1;
    bot.holdMs = 0;
    scene.player.releaseJump();
    scene.player.placeFeetAt(scene.spawnPoint.x, scene.spawnPoint.y);
    scene.director.rewindTo(scene.spawnPoint.x);
    scene.cameras.main.setScroll(scene.spawnPoint.x - 300, 0);
    scene.checkpoint = { x: scene.spawnPoint.x, y: scene.spawnPoint.y, score: 0, crystals: 0, shield: false };
    scene.state = 'running';
    scene.elapsed = 0;
    scene.crystals = 0;
    scene.score = 0;
    scene.hasShield = false;
    lastDeaths = scene.deaths;
  };
  restart();

  const DEATHS_PER_ATTEMPT = 8;
  const MAX_ATTEMPTS = 6;
  let deathsThisAttempt = 0;
  let furthestTile = 0;

  let t = 0;
  let steps = 0;
  const maxSteps = 40000;
  while (steps < maxSteps) {
    decide(frameMs);
    t += frameMs;
    g.step(t, frameMs);
    steps++;
    furthestTile = Math.max(furthestTile, Math.round(scene.player.x / TILE));

    if (scene.deaths !== lastDeaths) {
      lastDeaths = scene.deaths;
      deathsThisAttempt += 1;
      deathsAt.push({ tile: Math.round(scene.player.x / TILE), ...scene.lastHit, cp: Math.round(scene.checkpoint.x / TILE), attempt });
      if (deathsThisAttempt >= DEATHS_PER_ATTEMPT) {
        if (attempt >= MAX_ATTEMPTS) break;
        deathsThisAttempt = 0;
        restart();
      }
    }
    if (!scene.scene.isActive() || scene.state === 'won') break;
    // Yield occasionally so the page stays responsive.
    if (steps % 600 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  // Let the win transition finish, then put rendering back for the screenshot.
  for (let i = 0; i < 200; i++) {
    t += frameMs;
    g.step(t, frameMs);
  }
  g.scene.render = realRender;
  g.step(t, frameMs);

  return {
    attempts: attempt,
    furthestTile,
    steps,
    gameSeconds: +((steps * frameMs) / 1000).toFixed(1),
    finalX: Math.round(scene.player.x),
    tileX: Math.round(scene.player.x / TILE),
    state: scene.state,
    deaths: scene.deaths,
    deathTiles: deathsAt,
    crystals: scene.crystals,
    score: scene.score,
    pooledObjects: scene.director.poolSize,
    winActive: g.scene.getScene('Win').scene.isActive(),
    log
  };
}, 1000 / fps);

console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: path.join(shotDir, '10-autoplay-end.png') });
await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} runtime error(s):`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
if (!result.winActive) {
  console.error('\nautoplay did not reach the win screen');
  process.exit(1);
}
console.log('\nautoplay reached the level end with no runtime errors');
