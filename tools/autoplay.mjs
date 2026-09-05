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
 *        node tools/autoplay.mjs --mix out.wav [--mix-seconds 45]
 *
 * --mix renders the WHOLE MIX of a real run — music bed and every sound effect, at the
 * times actual play produces them — to a WAV. It works by handing the game an
 * OfflineAudioContext whose clock IS the stepped game clock, so although the run
 * simulates at ~50x real time, each sound still lands at its true moment. A live
 * recording cannot do this: Web Audio schedules against the real audio clock, so a
 * sped-up run would stack seventy seconds of effects into one or two.
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
const mixOut = arg('mix', null);
const mixSeconds = Number(arg('mix-seconds', 45));
const SR = 44100;
const shotDir = path.resolve('tools/shots');
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

if (mixOut) {
  // Must be installed before the page scripts run: the audio manager builds its context on
  // first unlock, and it has to build it on ours. currentTime is shadowed with an own
  // property so the stepping loop can drive the audio clock from the game clock, and the
  // music scheduler's setInterval is captured rather than started — wall-clock ticks would
  // never fire during a run that simulates in a couple of seconds.
  await page.addInitScript(([sr, secs]) => {
    const off = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    window.__now = 0;
    window.__mixSeconds = secs;
    Object.defineProperty(off, 'currentTime', { get: () => window.__now, configurable: true });
    // unlock() resumes the context on the first gesture, which an offline context refuses.
    // Harmless to the render, but it surfaces as a runtime error and fails the run.
    off.resume = () => Promise.resolve();
    window.__off = off;
    window.AudioContext = function () { return off; };
    window.webkitAudioContext = window.AudioContext;
    window.__musicTicks = [];
    const realSetInterval = window.setInterval;
    window.setInterval = (fn, ms) => {
      if (ms <= 100) { window.__musicTicks.push(fn); return 0; }
      return realSetInterval(fn, ms);
    };
  }, [SR, mixSeconds]);
}

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
    if (window.__off) {
      // The audio clock follows the game clock, and the music scheduler is ticked by hand
      // for the same reason: both are driven by the simulation, not by wall time.
      window.__now = t / 1000;
      for (const fn of window.__musicTicks) fn();
      if (window.__now >= window.__mixSeconds) break;
    }
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

if (mixOut) {
  const b64 = await page.evaluate(async () => {
    const buf = await window.__off.startRendering();
    const n = buf.length;
    const ch = buf.numberOfChannels;
    const inter = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) inter[i * ch + c] = d[i];
    }
    const view = new DataView(new ArrayBuffer(44 + inter.length * 2));
    const str = (o, v) => { for (let i = 0; i < v.length; i++) view.setUint8(o + i, v.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + inter.length * 2, true); str(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
    view.setUint32(24, buf.sampleRate, true); view.setUint32(28, buf.sampleRate * ch * 2, true);
    view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, inter.length * 2, true);
    for (let i = 0; i < inter.length; i++) {
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, inter[i])) * 32767, true);
    }
    let bin = '';
    const u8 = new Uint8Array(view.buffer);
    const CHUNK = 8192; // one giant apply() blows the argument limit on a minutes-long mix
    for (let i = 0; i < u8.length; i += CHUNK) bin += String.fromCharCode(...u8.subarray(i, i + CHUNK));
    return btoa(bin);
  });
  const wav = Buffer.from(b64, 'base64');
  fs.writeFileSync(mixOut, wav);
  let peak = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) {
    const v = wav.readInt16LE(i) / 32767;
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
    cnt++;
  }
  const db = (x) => (20 * Math.log10(x)).toFixed(1);
  console.log(`\nmix -> ${mixOut}  ${mixSeconds}s  peak ${db(peak)} dBFS  rms ${db(Math.sqrt(sum / cnt))} dBFS`);
}

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} runtime error(s):`);
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}
// In --mix mode the run is cut short on purpose at --mix-seconds, so reaching the goal is
// not expected and not the point.
if (!mixOut && !result.winActive) {
  console.error('\nautoplay did not reach the win screen');
  process.exit(1);
}
console.log(mixOut ? '\nmix rendered with no runtime errors' : '\nautoplay reached the level end with no runtime errors');
