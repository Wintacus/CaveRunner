/**
 * Runtime textures.
 *
 * Most sprites are still drawn here into a canvas texture at boot (dark stone silhouettes
 * with glowing rim light). Three keys are stamped from files in `public/assets/art/` so the
 * look can change without touching hitboxes.
 *
 * ART SWAP POINT — file-backed keys (see `ART_FILES`) are stamped into existing canvas
 * sizes at boot so hitboxes do not change: runner (jump/shield variants of the same
 * silhouette), spike + stalagmite, pickup crystal, and the mid parallax layer. Bats,
 * spiders and everything else stay procedural. Further swaps: load a PNG in PreloadScene,
 * add it to `ART_FILES`, and stamp it from the matching `make*` below.
 *
 * SPRITE_SIZES is filled in by `canvasTexture` as the textures are drawn rather than
 * maintained by hand. The hand-written version had drifted badly — six of its ten entries
 * disagreed with the texture actually produced, it was missing thirteen of the twenty-three
 * keys, and it conflated two different measurements, since the character sprites are drawn
 * into a canvas 16px larger than the art on each axis to leave room for the glow. Anyone
 * generating art to those numbers would have produced the wrong thing.
 */
import { COLORS } from '../config/tuning.js';

export const KEYS = {
  player: 'player',
  playerJump: 'player_jump',
  playerShield: 'player_shield',
  playerJumpShield: 'player_jump_shield',
  shieldRing: 'shield_ring',
  shieldShard: 'shield_shard',
  batOpen: 'bat_open',
  batClosed: 'bat_closed',
  spiderTuck: 'spider_tuck',
  spiderSpread: 'spider_spread',
  crystal: 'crystal',
  mushroom: 'mushroom',
  checkpointOff: 'checkpoint_off',
  checkpointOn: 'checkpoint_on',
  goal: 'goal',
  stalagmite: 'stalagmite',
  stalactite: 'stalactite',
  spike: 'spike',
  glow: 'glow',
  spark: 'spark',
  bgFar: 'bg_far',
  bgMid: 'bg_mid',
  bgNear: 'bg_near'
};

/**
 * Pixel dimensions of every generated texture, keyed as in KEYS. Populated at boot by
 * `canvasTexture`, so it always describes what the game actually draws — this is the size
 * a replacement PNG needs to be, glow padding included.
 */
export const SPRITE_SIZES = {};

/**
 * File-backed replacement art. Loaded in PreloadScene under `key`, then stamped into the
 * matching KEYS canvas at the size the game already uses.
 */
export const ART_FILES = {
  runner: { key: 'art_runner', path: 'assets/art/runner-v4-gray-hat.png' },
  spikes: { key: 'art_spikes', path: 'assets/art/spikes-rose.png' },
  bgMid: { key: 'art_bg_mid', path: 'assets/art/background-v2.png' },
  crystal: { key: 'art_crystal', path: 'assets/art/crystal-amber.png' }
};


const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const rgba = (n, a) => {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
};

/** Create (or replace) a canvas-backed texture and hand its 2D context to `draw`. */
function canvasTexture(scene, key, w, h, draw) {
  SPRITE_SIZES[key] = [w, h]; // the record of what was drawn, so it cannot disagree with it
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

function sourceImage(scene, key) {
  if (!scene.textures.exists(key)) return null;
  const img = scene.textures.get(key).getSourceImage();
  return img && img.width ? img : null;
}

/** Scale `img` to fit `box`, bottom-aligned so grounded sprites keep their feet. */
function stampContained(ctx, img, x, y, boxW, boxH) {
  if (!img) return false;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (boxW - dw) / 2, y + (boxH - dh), dw, dh);
  return true;
}

/** Cover-draw `img` into a box (may crop). Used for the mid parallax tile. */
function stampCover(ctx, img, x, y, boxW, boxH) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.max(boxW / img.width, boxH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh);
}

/**
 * Cross-fade the left `blend` pixels onto the right edge so a GL_REPEAT wrap is seamless.
 * The source PNG is left untouched; this only runs on the runtime canvas.
 */
function wrapBlendHorizontal(ctx, w, h, blend) {
  const slice = Math.min(blend, w >> 2);
  if (slice < 2) return;
  const tmp = document.createElement('canvas');
  tmp.width = slice;
  tmp.height = h;
  tmp.getContext('2d').drawImage(ctx.canvas, 0, 0, slice, h, 0, 0, slice, h);
  for (let i = 0; i < slice; i++) {
    ctx.globalAlpha = i / (slice - 1);
    ctx.drawImage(tmp, i, 0, 1, h, w - slice + i, 0, 1, h);
  }
  ctx.globalAlpha = 1;
}

/** Glow behind opaque art, never composited through it (that crushed the gray hat). */
function glowBehind(ctx, x, y, radius, colour, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  glowBlob(ctx, x, y, radius, colour, strength);
  ctx.restore();
}

/** Soft radial glow behind a shape — the core of the bioluminescent look. */
function glowBlob(ctx, x, y, radius, colour, strength = 0.9) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(colour, strength));
  g.addColorStop(0.45, rgba(colour, strength * 0.35));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Player — a lantern-lit runner. Rim-lit silhouette so it always reads against
// the dark cave, with a bright core the invincibility flash can pulse.
// ---------------------------------------------------------------------------
/**
 * @param {object} opts
 * @param {boolean} opts.crouch  mid-jump tuck
 * @param {number}  opts.rim     rim-light colour; amber marks the shield as a *secondary*
 *                               cue reinforcing the bubble, never as the only signal
 */
function makePlayer(scene, key, { crouch = false, rim = COLORS.teal } = {}) {
  const [w, h] = [30, 42];
  canvasTexture(scene, key, w + 16, h + 16, (ctx) => {
    const ox = 8;
    const oy = 8;
    const art = sourceImage(scene, ART_FILES.runner.key);
    if (art) {
      const bodyH = crouch ? h - 6 : h;
      const bodyY = oy + (h - bodyH);
      stampContained(ctx, art, 2, 2, w + 12, h + 12);
      // Destination-over so the gray hat cannot be multiplied into the rim glow.
      glowBehind(ctx, ox + w / 2, oy + h / 2, 22, rim, rim === COLORS.amber ? 0.55 : 0.28);
      return;
    }
    glowBlob(ctx, ox + w / 2, oy + h / 2, 22, rim, 0.5);

    // Body
    const bodyH = crouch ? h - 6 : h;
    const bodyY = oy + (h - bodyH);
    ctx.fillStyle = hex(0x121722);
    roundedRect(ctx, ox + 2, bodyY, w - 4, bodyH, 9);
    ctx.fill();

    // Rim light along the leading edge (right) and top.
    ctx.strokeStyle = rgba(rim, 0.95);
    ctx.lineWidth = 2.5;
    roundedRect(ctx, ox + 2, bodyY, w - 4, bodyH, 9);
    ctx.stroke();

    // Chest lamp — the character's own light source.
    glowBlob(ctx, ox + w / 2 + 3, bodyY + bodyH * 0.42, 11, COLORS.ice, 0.85);
    ctx.fillStyle = hex(0xffffff);
    ctx.beginPath();
    ctx.arc(ox + w / 2 + 3, bodyY + bodyH * 0.42, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // Visor, facing right (movement direction is always right).
    ctx.fillStyle = rgba(COLORS.ice, 0.9);
    roundedRect(ctx, ox + w - 13, bodyY + 7, 9, 6, 3);
    ctx.fill();

    // Feet
    ctx.fillStyle = rgba(rim, 0.55);
    roundedRect(ctx, ox + 4, oy + h - 5, 9, 5, 2);
    ctx.fill();
    roundedRect(ctx, ox + w - 13, oy + h - 5, 9, 5, 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Bat — wings open / closed. Shape change (not colour) carries the telegraph.
// ---------------------------------------------------------------------------
function makeBat(scene, key, open) {
  const w = 40;
  const h = 30;
  canvasTexture(scene, key, w + 16, h + 16, (ctx) => {
    const cx = (w + 16) / 2;
    const cy = (h + 16) / 2;
    glowBlob(ctx, cx, cy, 20, COLORS.rose, 0.45);

    const span = open ? 19 : 10;
    const lift = open ? -9 : 3;
    ctx.fillStyle = hex(0x1a1420);
    ctx.strokeStyle = rgba(COLORS.rose, 0.9);
    ctx.lineWidth = 2;

    // Wings
    for (const dir of [-1, 1]) {
      polygon(ctx, [
        [cx, cy - 2],
        [cx + dir * span, cy + lift],
        [cx + dir * (span - 4), cy + 5],
        [cx + dir * 4, cy + 7]
      ]);
      ctx.fill();
      ctx.stroke();
    }

    // Body + ears
    ctx.fillStyle = hex(0x241a2c);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    polygon(ctx, [
      [cx - 5, cy - 6],
      [cx - 2, cy - 13],
      [cx, cy - 6]
    ]);
    ctx.fill();
    polygon(ctx, [
      [cx + 5, cy - 6],
      [cx + 2, cy - 13],
      [cx, cy - 6]
    ]);
    ctx.fill();

    // Eyes
    ctx.fillStyle = hex(0xffe9a8);
    ctx.beginPath();
    ctx.arc(cx - 2.5, cy - 1, 1.8, 0, Math.PI * 2);
    ctx.arc(cx + 2.5, cy - 1, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Spider — legs tucked / spread. Spread legs are the wind-up tell.
// ---------------------------------------------------------------------------
function makeSpider(scene, key, spread) {
  const w = 34;
  const h = 30;
  canvasTexture(scene, key, w + 16, h + 16, (ctx) => {
    const cx = (w + 16) / 2;
    const cy = (h + 16) / 2;
    glowBlob(ctx, cx, cy, 18, COLORS.violet, 0.5);

    ctx.strokeStyle = rgba(COLORS.violet, 0.9);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const reach = spread ? 15 : 9;
    const drop = spread ? 2 : 8;
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const ay = cy - 5 + i * 5;
        ctx.beginPath();
        ctx.moveTo(cx + dir * 3, ay);
        ctx.lineTo(cx + dir * (reach * 0.6), ay - 4 + i * 2);
        ctx.lineTo(cx + dir * reach, ay + drop + i);
        ctx.stroke();
      }
    }

    ctx.fillStyle = hex(0x1d1526);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 9, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye cluster
    ctx.fillStyle = hex(0xffe9a8);
    for (const [dx, dy] of [
      [-3, -3],
      [0, -4],
      [3, -3],
      [-1.5, -0.5],
      [1.5, -0.5]
    ]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ---------------------------------------------------------------------------
// Pickups and markers
// ---------------------------------------------------------------------------
function makeCrystal(scene) {
  canvasTexture(scene, KEYS.crystal, 36, 42, (ctx) => {
    const art = sourceImage(scene, ART_FILES.crystal.key);
    if (art) {
      stampContained(ctx, art, 0, 0, 36, 42);
      glowBehind(ctx, 18, 21, 17, COLORS.amber, 0.7);
      return;
    }
    glowBlob(ctx, 18, 21, 17, COLORS.teal, 0.75);
    polygon(ctx, [
      [18, 4],
      [28, 18],
      [18, 38],
      [8, 18]
    ]);
    ctx.fillStyle = rgba(COLORS.teal, 0.55);
    ctx.fill();
    ctx.strokeStyle = rgba(0xffffff, 0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    polygon(ctx, [
      [18, 4],
      [18, 38],
      [8, 18]
    ]);
    ctx.fillStyle = rgba(0xffffff, 0.35);
    ctx.fill();
  });
}

function makeMushroom(scene) {
  canvasTexture(scene, KEYS.mushroom, 46, 46, (ctx) => {
    glowBlob(ctx, 23, 23, 22, COLORS.amber, 0.8);
    // Stem
    ctx.fillStyle = hex(0x2b2438);
    roundedRect(ctx, 19, 24, 8, 14, 3);
    ctx.fill();
    // Cap
    ctx.fillStyle = hex(0x3a2a44);
    ctx.beginPath();
    ctx.ellipse(23, 24, 15, 11, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.amber, 0.95);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Glowing spots
    ctx.fillStyle = rgba(COLORS.amber, 0.9);
    for (const [x, y, r] of [
      [17, 19, 2.6],
      [26, 17, 2.2],
      [30, 21, 1.8]
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function makeCheckpoint(scene, key, lit) {
  const w = 40;
  const h = 88;
  canvasTexture(scene, key, w, h, (ctx) => {
    if (lit) glowBlob(ctx, w / 2, 22, 30, COLORS.teal, 0.9);
    // Post
    ctx.fillStyle = hex(0x222a3a);
    roundedRect(ctx, w / 2 - 3, 16, 6, h - 18, 3);
    ctx.fill();
    // Crystal lamp on top
    polygon(ctx, [
      [w / 2, 4],
      [w / 2 + 11, 20],
      [w / 2, 36],
      [w / 2 - 11, 20]
    ]);
    ctx.fillStyle = lit ? rgba(COLORS.teal, 0.85) : rgba(0x4a5568, 0.6);
    ctx.fill();
    ctx.strokeStyle = lit ? rgba(0xffffff, 0.95) : rgba(0x8fa3bf, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Base
    ctx.fillStyle = hex(0x2c3446);
    roundedRect(ctx, w / 2 - 10, h - 8, 20, 8, 3);
    ctx.fill();
  });
}

function makeGoal(scene) {
  const w = 96;
  const h = 150;
  canvasTexture(scene, KEYS.goal, w, h, (ctx) => {
    glowBlob(ctx, w / 2, h / 2, 62, COLORS.teal, 0.5);
    glowBlob(ctx, w / 2, h / 2, 34, COLORS.ice, 0.55);
    // Arch of standing crystals
    ctx.strokeStyle = rgba(COLORS.teal, 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, h - 6);
    ctx.quadraticCurveTo(w / 2, -18, w - 14, h - 6);
    ctx.stroke();
    ctx.fillStyle = rgba(COLORS.ice, 0.14);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = 14 + t * (w - 28);
      const y = h - 6 - Math.sin(t * Math.PI) * (h - 34);
      glowBlob(ctx, x, y, 9, COLORS.ice, 0.9);
    }
  });
}

// ---------------------------------------------------------------------------
// Hazards — jagged silhouettes with a glowing edge. The spikes read as danger by
// SHAPE first (sharp points, hard angles) so the cue survives colour-blindness.
// ---------------------------------------------------------------------------
function makeStalagmite(scene) {
  const w = 48;
  const h = 68;
  canvasTexture(scene, KEYS.stalagmite, w, h, (ctx) => {
    const art = sourceImage(scene, ART_FILES.spikes.key);
    if (art) {
      glowBlob(ctx, w / 2, 14, 20, COLORS.rose, 0.35);
      stampContained(ctx, art, 0, 0, w, h);
      return;
    }
    glowBlob(ctx, w / 2, 14, 20, COLORS.rose, 0.4);
    polygon(ctx, [
      [w / 2 - 15, h],
      [w / 2 - 5, 22],
      [w / 2, 4],
      [w / 2 + 6, 24],
      [w / 2 + 15, h]
    ]);
    ctx.fillStyle = hex(0x232a3a);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.rose, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = rgba(0xffffff, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 6);
    ctx.lineTo(w / 2 - 4, h - 6);
    ctx.stroke();
  });
}

function makeStalactite(scene) {
  // One tile-tall unit; the game stretches it to the authored length and the tip
  // glow stays proportional because it is drawn into the bottom of the texture.
  const w = 48;
  const h = 32;
  canvasTexture(scene, KEYS.stalactite, w, h, (ctx) => {
    polygon(ctx, [
      [w / 2 - 16, 0],
      [w / 2 + 16, 0],
      [w / 2 + 6, h],
      [w / 2 - 6, h]
    ]);
    ctx.fillStyle = hex(0x232a3a);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.rose, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function makeSpike(scene) {
  const w = 32;
  const h = 30;
  canvasTexture(scene, KEYS.spike, w, h, (ctx) => {
    const art = sourceImage(scene, ART_FILES.spikes.key);
    if (art) {
      glowBlob(ctx, w / 2, h - 6, 16, COLORS.rose, 0.3);
      stampContained(ctx, art, 0, 0, w, h);
      return;
    }
    glowBlob(ctx, w / 2, h - 6, 16, COLORS.rose, 0.35);
    ctx.fillStyle = hex(0x232a3a);
    ctx.strokeStyle = rgba(COLORS.rose, 0.85);
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 9;
      polygon(ctx, [
        [x, h],
        [x + 5, h - 22],
        [x + 10, h]
      ]);
      ctx.fill();
      ctx.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// Shield bubble
//
// A ring rather than a filled disc, so it never hides a hazard the player has to read,
// and deliberately *asymmetric* — a perfectly even ring looks static no matter how fast
// it spins, and the rotation is half the reason the cue reads in peripheral vision.
// ---------------------------------------------------------------------------
function makeShieldRing(scene) {
  const size = 96;
  const r = 36;
  canvasTexture(scene, KEYS.shieldRing, size, size, (ctx) => {
    const c = size / 2;

    // Soft band of light around the rim.
    const grad = ctx.createRadialGradient(c, c, r - 10, c, c, r + 8);
    grad.addColorStop(0, rgba(COLORS.amber, 0));
    grad.addColorStop(0.6, rgba(COLORS.amber, 0.32));
    grad.addColorStop(1, rgba(COLORS.amber, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, r + 8, 0, Math.PI * 2);
    ctx.fill();

    // Crisp rim.
    ctx.strokeStyle = rgba(COLORS.amber, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();

    // Facets: brighter arcs at uneven intervals, which is what makes the spin visible.
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (const [from, len] of [
      [0.15, 0.5],
      [1.25, 0.32],
      [2.6, 0.62],
      [4.4, 0.24]
    ]) {
      ctx.strokeStyle = rgba(0xffffff, 0.75);
      ctx.beginPath();
      ctx.arc(c, c, r, from, from + len);
      ctx.stroke();
    }

    // Highlight blooms where facets meet.
    for (const a of [0.15, 2.6, 4.4]) {
      glowBlob(ctx, c + Math.cos(a) * r, c + Math.sin(a) * r, 9, 0xffffff, 0.5);
    }
  });
}

/** A sliver of the bubble, thrown outward when the shield is spent. */
function makeShieldShard(scene) {
  canvasTexture(scene, KEYS.shieldShard, 20, 20, (ctx) => {
    glowBlob(ctx, 10, 10, 9, COLORS.amber, 0.6);
    polygon(ctx, [
      [10, 1],
      [16, 12],
      [9, 18],
      [5, 10]
    ]);
    ctx.fillStyle = rgba(COLORS.amber, 0.85);
    ctx.fill();
    ctx.strokeStyle = rgba(0xffffff, 0.9);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
function makeGlow(scene) {
  canvasTexture(scene, KEYS.glow, 64, 64, (ctx) => glowBlob(ctx, 32, 32, 32, 0xffffff, 1));
  canvasTexture(scene, KEYS.spark, 12, 12, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, 6, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// Parallax layers — three tileable slabs at different depths.
// ---------------------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

function makeParallax(scene, height) {
  const W = 512;
  // TileSprite + WebGL GL_REPEAT needs power-of-two sources. 540 is NPOT and Phaser
  // would stretch each layer into a 1024-tall pad, which is the dark-rectangle bug.
  const H = 512;
  void height;

  // Far: the back wall of the cavern, plus a haze of distant spores.
  canvasTexture(scene, KEYS.bgFar, W, H, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#080b14');
    g.addColorStop(0.55, '#0d1220');
    g.addColorStop(1, '#070a11');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      glowBlob(ctx, r() * w, r() * h * 0.85, 6 + r() * 16, r() > 0.35 ? COLORS.teal : COLORS.violet, 0.07 + r() * 0.06);
    }
    // Distant column silhouettes
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    for (let i = 0; i < 5; i++) {
      const x = (i + r() * 0.6) * (w / 5);
      const cw = 26 + r() * 34;
      polygon(ctx, [
        [x, 0],
        [x + cw, 0],
        [x + cw * 0.62, h],
        [x + cw * 0.28, h]
      ]);
      ctx.fill();
    }
  });

  // Mid: painted cavern. TileSprite needs a power-of-two texture or Phaser stretches the
  // painting into a 1024x1024 pad and GL_REPEAT samples the leftover as dark rectangles
  // and a vertical seam. 1024x512 is POT, filled, and wrap-blended; the PNG is unchanged.
  const midArt = sourceImage(scene, ART_FILES.bgMid.key);
  if (midArt) {
    const midW = 1024;
    const midH = 512;
    canvasTexture(scene, KEYS.bgMid, midW, midH, (ctx, w, h) => {
      stampCover(ctx, midArt, 0, 0, w, h);
      wrapBlendHorizontal(ctx, w, h, 128);
    });
  } else canvasTexture(scene, KEYS.bgMid, W, H, (ctx, w, h) => {
    const r = rng(21);
    ctx.fillStyle = 'rgba(13,18,30,0.95)';
    for (let i = 0; i < 6; i++) {
      const x = i * (w / 6) + r() * 20;
      const peak = h * (0.42 + r() * 0.22);
      const bw = 60 + r() * 70;
      polygon(ctx, [
        [x - bw / 2, h],
        [x - bw * 0.2, peak],
        [x + bw * 0.1, peak - 18],
        [x + bw / 2, h]
      ]);
      ctx.fill();
      glowBlob(ctx, x + bw * 0.06, peak - 10, 20, COLORS.teal, 0.16);
    }
    // Hanging spires from the ceiling
    for (let i = 0; i < 7; i++) {
      const x = r() * w;
      const len = h * (0.12 + r() * 0.18);
      const tw = 16 + r() * 22;
      polygon(ctx, [
        [x - tw / 2, 0],
        [x + tw / 2, 0],
        [x, len]
      ]);
      ctx.fillStyle = 'rgba(13,18,30,0.95)';
      ctx.fill();
      if (r() > 0.55) glowBlob(ctx, x, len - 4, 12, COLORS.violet, 0.2);
    }
  });

  // Near: dark foreground rock framing the top and bottom of the screen.
  canvasTexture(scene, KEYS.bgNear, W, H, (ctx, w, h) => {
    const r = rng(99);
    ctx.fillStyle = 'rgba(4,6,11,0.97)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= w; x += 64) ctx.lineTo(x, 10 + r() * 26);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 64) ctx.lineTo(x, h - (12 + r() * 30));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 4; i++) glowBlob(ctx, r() * w, h - 12 - r() * 20, 14, COLORS.teal, 0.18);
  });
}

/** Build every runtime texture. Called once, from PreloadScene. */
export function generateTextures(scene, viewHeight) {
  makePlayer(scene, KEYS.player);
  makePlayer(scene, KEYS.playerJump, { crouch: true });
  makePlayer(scene, KEYS.playerShield, { rim: COLORS.amber });
  makePlayer(scene, KEYS.playerJumpShield, { crouch: true, rim: COLORS.amber });
  makeShieldRing(scene);
  makeShieldShard(scene);
  makeBat(scene, KEYS.batOpen, true);
  makeBat(scene, KEYS.batClosed, false);
  makeSpider(scene, KEYS.spiderTuck, false);
  makeSpider(scene, KEYS.spiderSpread, true);
  makeCrystal(scene);
  makeMushroom(scene);
  makeCheckpoint(scene, KEYS.checkpointOff, false);
  makeCheckpoint(scene, KEYS.checkpointOn, true);
  makeGoal(scene);
  makeStalagmite(scene);
  makeStalactite(scene);
  makeSpike(scene);
  makeGlow(scene);
  makeParallax(scene, viewHeight);
}
