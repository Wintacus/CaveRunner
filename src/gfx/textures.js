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
  spikeBig: 'spike_big',
  glow: 'glow',
  spark: 'spark',
  wallAtlas: 'wall_atlas',
  bgFar: 'bg_far',
  bgMid: 'bg_mid',
  bgNear: 'bg_near'
};

/**
 * Frames in the ground stride cycle.
 *
 * The squash is baked per frame rather than tweened on the sprite because `setScale`
 * resizes the Arcade body with it — measured: scaling to (0.9, 1.1) takes the 20x34 body
 * to 18x37.4 and moves it. A hitbox that breathes is not a trade worth making for a
 * cosmetic bounce. `stampRunnerArt` scales about the bottom of its box, so a baked squash
 * keeps the feet planted for free.
 *
 * Eight frames because the count is the whole problem. The same squash across two frames
 * was tried and read as a pulse — a hard pop between two shapes, which is what the jump
 * tween never looks like because a tween interpolates. Eight at ~3 strides a second is 24
 * changes a second, which reads as the continuous stretch-and-compress it is meant to be.
 */
export const STRIDE_FRAMES = 8;

/** Texture key for stride frame `i`, in the given shield state. */
export const strideKey = (i, shielded) => `player_stride_${shielded ? 's' : 'n'}_${i}`;

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
/**
 * WebP rather than PNG. These are painted images, and PNG is lossless — the wrong tool for
 * them by roughly an order of magnitude: 1736KB of PNG became 180KB of WebP with the
 * dimensions untouched, which is most of a second of staring at "Loading..." on a phone.
 * The sprites are encoded at higher quality than the backdrop because `rimOutline` traces
 * their alpha, so artefacts there would show as a fuzzy outline rather than as fuzzy art.
 *
 * The PNG originals are in git at c637f93 if anything ever needs re-exporting.
 */
/**
 * The hazard palette.
 *
 * The painted spike art (spikes-rose.webp) is dark faceted rock with a hot crimson rim and
 * a lava crack down it. The GEOMETRY is right for this level — sharp, dark, properly
 * menacing — but the colour is a volcanic language dropped into a cold bioluminescent cave,
 * and it fought the art rather than sitting in it.
 *
 * So the art is recoloured at boot instead of replaced. The rock is near-grey and grey has
 * no saturation, so a hue remap moves only the rim and the crack — exactly the parts that
 * clashed — and leaves every bit of the painting's shading and silhouette intact.
 *
 * `hue` is the target in degrees, `sat` and `light` scale what the pixel already had.
 */
/**
 * Hazard tone. The recolour leaves near-grey pixels alone, so this only moves the painted
 * rim: the body stays dark rock and the silhouette still does the work.
 *
 * sat and light were 0.5 / 0.88, chosen when the platforms were flat slate and a dark shape
 * with a thin violet edge stood out against them easily. The painted wall put glowing
 * mushrooms and veins behind every hazard, and at that setting the spikes got lost in it.
 * The rim is now hot enough to read against lit rock. Hue stays at 252: violet is already
 * well clear of the cave's cyan, so this is a luminance problem, not a hue one.
 */
export const HAZARD_TONE = { hue: 252, sat: 0.92, light: 1.4, glow: 0xbcaaff };

export const ART_FILES = {
  runner: { key: 'art_runner', path: 'assets/art/runner-v4-gray-hat.webp' },
  spikes: { key: 'art_spikes', path: 'assets/art/spikes-rose.webp' },
  bgMid: { key: 'art_bg_mid', path: 'assets/art/background-v2.webp' },
  crystal: { key: 'art_crystal', path: 'assets/art/crystal-amber.webp' },

  // Painted platform kit, cut out of the source sheets by tools/cut-platform-art.mjs and
  // already recoloured to the cave's blue and baked at display size. Counts come from that
  // script's own output, which prints them on every run.
  //
  //   wall    39 face-on wall panels, each with a matching painted stone cap (sheet 07)
  //   panel    9 wide feature panels — light falls, blooms, mushroom shelves (sheets 05/06)
  //   growth   9 overlays that stand on or hang off a lip (sheet 03)
  //   far/mid/near  12/12/16 underhang pieces at three depths (sheets 09/10/11)
  //   edgeR/edgeL   36/38 pit-edge pieces, three looks per side (sheets 12/12b/12c, 13/13b/13c)
  ...Object.fromEntries([
    ...Array.from({ length: 39 }, (_, i) => [
      `wall${i}`,
      { key: `art_wall_${i}`, path: `assets/art/platform/family-sheet-3-${String(i).padStart(2, '0')}.webp` }
    ]),
    ...Array.from({ length: 4 }, (_, i) => [
      `panel${i}`,
      { key: `art_panel_${i}`, path: `assets/art/platform/family-sheet-1-0${i}.webp` }
    ]),
    ...Array.from({ length: 5 }, (_, i) => [
      `panel${4 + i}`,
      { key: `art_panel_${4 + i}`, path: `assets/art/platform/family-sheet-2-0${i}.webp` }
    ]),
    ...Array.from({ length: 9 }, (_, i) => [
      `growth${i}`,
      { key: `art_growth_${i}`, path: `assets/art/platform/overlays-fungus-drips-streaks-0${i}.webp` }
    ]),
    // Pit edges: ragged rock laid over a platform's vertical end, half of it hanging into
    // the pit. Three looks per side, all used together so no pit repeats a shape. The
    // gameplay rule — nothing overhangs at the walking surface — is baked into the cut.
    ...[['edgeR', 'edge-r-a', 12], ['edgeR', 'edge-r-b', 12], ['edgeR', 'edge-r-c', 12],
        ['edgeL', 'edge-l-a', 13], ['edgeL', 'edge-l-b', 13], ['edgeL', 'edge-l-c', 12]]
      .flatMap(([group, stem, n], gi) =>
        Array.from({ length: n }, (_, i) => [
          `${group}_${gi}_${i}`,
          { key: `art_${stem}_${i}`, path: `assets/art/platform/${stem}-${String(i).padStart(2, '0')}.webp` }
        ])
      ),
    // Broken rock fringe, scattered along the lip. Delivered as corner shoulders, measured
    // as having nothing at the top, so used for what they actually are.
    ...Array.from({ length: 8 }, (_, i) => [
      `rubbleR${i}`, { key: `art_rubble_r_${i}`, path: `assets/art/platform/rubble-r-0${i}.webp` }
    ]),
    ...Array.from({ length: 9 }, (_, i) => [
      `rubbleL${i}`, { key: `art_rubble_l_${i}`, path: `assets/art/platform/rubble-l-0${i}.webp` }
    ]),
    // Underhangs, three depths, all drawn IN FRONT of the platform. See platform-dressing.js.
    ...[['far', 12], ['mid', 12], ['near', 16]].flatMap(([name, n]) =>
      Array.from({ length: n }, (_, i) => [
        `${name}${i}`,
        { key: `art_${name}_${i}`, path: `assets/art/platform/underhang-${name}-${String(i).padStart(2, '0')}.webp` }
      ])
    )
  ])
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
/**
 * Stamp art with its saturated pixels remapped to a new hue.
 *
 * Done by pixel rather than with ctx.filter deliberately: canvas filters are unevenly
 * supported on the mobile Safari this game is actually played on, and a silently ignored
 * filter would ship the original crimson to the one device that matters. This runs once per
 * texture at boot on a ~380x360 image, so the cost is irrelevant.
 */
const RECOLOURED = new WeakMap();

/** The recoloured art, built once per image and tone. */
function recolouredArt(img, tone) {
  if (!img) return null;
  const key = `${tone.hue}|${tone.sat}|${tone.light}`;
  let byTone = RECOLOURED.get(img);
  if (!byTone) {
    byTone = new Map();
    RECOLOURED.set(img, byTone);
  }
  if (byTone.has(key)) return byTone.get(key);
  const made = buildRecoloured(img, tone);
  byTone.set(key, made);
  return made;
}

function buildRecoloured(img, tone) {
  const buf = document.createElement('canvas');
  buf.width = img.width;
  buf.height = img.height;
  const bctx = buf.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(img, 0, 0);
  const data = bctx.getImageData(0, 0, buf.width, buf.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 0.04) continue; // near-grey: the rock itself, left exactly as painted
    const sat = Math.min(1, (d / (1 - Math.abs(2 * l - 1))) * tone.sat);
    const li = Math.min(1, l * tone.light);
    // HSL -> RGB at the target hue.
    const c = (1 - Math.abs(2 * li - 1)) * sat;
    const hp = tone.hue / 60;
    const xx = c * (1 - Math.abs((hp % 2) - 1));
    const m = li - c / 2;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (hp < 1) { rr = c; gg = xx; } else if (hp < 2) { rr = xx; gg = c; } else if (hp < 3) { gg = c; bb = xx; }
    else if (hp < 4) { gg = xx; bb = c; } else if (hp < 5) { rr = xx; bb = c; } else { rr = c; bb = xx; }
    px[i] = (rr + m) * 255;
    px[i + 1] = (gg + m) * 255;
    px[i + 2] = (bb + m) * 255;
  }
  bctx.putImageData(data, 0, 0);
  return buf;
}

function stampRecoloured(ctx, img, x, y, boxW, boxH, tone) {
  return stampContained(ctx, recolouredArt(img, tone), x, y, boxW, boxH);
}

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

/**
 * Stamp the runner with a squash, lean or lift baked into the canvas rather than applied to
 * the sprite, so the Arcade hitbox never moves with the pose.
 */
function stampRunnerArt(ctx, img, w, h, { squashX = 1, squashY = 1, tilt = 0, lift = 0, pad = 8 } = {}) {
  // The art box is fixed at w+12 by h+12; `pad` is the transparent margin the canvas gives
  // it. Both offsets are pad-6 so the margin stays symmetric — the Arcade body is centred
  // on the canvas, so any asymmetry here would slide the hitbox off the figure.
  const boxX = pad - 6;
  const boxY = pad - 6 - lift;
  const boxW = w + 12;
  const boxH = h + 12;
  ctx.save();
  const px = boxX + boxW / 2;
  const py = boxY + boxH;
  ctx.translate(px, py);
  if (tilt) ctx.rotate(tilt);
  ctx.scale(squashX, squashY);
  ctx.translate(-px, -py);
  stampContained(ctx, img, boxX, boxY, boxW, boxH);
  ctx.restore();
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
/**
 * Rim-light the stamped art by tracing its own alpha.
 *
 * The procedural runner this replaced was a dark silhouette with a 2.5px teal stroke round
 * it, and that stroke was doing more work than it looked: it separated the character from
 * the cave, held the shape together as one object, and carried the shield state in its
 * colour. The painted PNG arrived with none of it and got a soft glow instead, which is
 * not the same thing — a glow bleeds outward and leaves the edge undefined, so the runner
 * dissolves into a busy background.
 *
 * Traced from the alpha channel rather than drawn as a path, because the source is a
 * picture and not a shape we know the outline of: silhouette it, stamp that silhouette
 * around a small circle of offsets, then put the art back on top.
 */
function rimOutline(ctx, source, w, h, colour, { width = 2, alpha = 0.85 } = {}) {
  const sil = document.createElement('canvas');
  sil.width = w;
  sil.height = h;
  const s = sil.getContext('2d');
  s.drawImage(source, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = rgba(colour, 1);
  s.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(a) * width, Math.sin(a) * width);
  }
  ctx.restore();
}

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
/**
 * `squash` is a {x, y} scale pair baked into the frame — the ground stride's stretch and
 * compress, the same shape the jump tween makes, an order of magnitude smaller.
 */
/**
 * `PLAYER_PAD` is transparent margin around the 30x42 figure, and it exists to hold the
 * glow. The glow used to be radius 22 at 0.28, which fitted in an 8px margin with nothing
 * to spare; a stronger halo at radius 27 ran off the edge of the texture and left a 6.7%
 * alpha rectangle where the gradient was clipped — a faint hard-edged box that travels with
 * the sprite. 12px of margin lets the gradient reach zero on its own.
 */
const PLAYER_PAD = 12;
const PLAYER_GLOW_R = 27;

function makePlayer(scene, key, { crouch = false, squash = null, rim = COLORS.teal } = {}) {
  const [w, h] = [30, 42];
  canvasTexture(scene, key, w + PLAYER_PAD * 2, h + PLAYER_PAD * 2, (ctx) => {
    const ox = PLAYER_PAD;
    const oy = PLAYER_PAD;
    const art = sourceImage(scene, ART_FILES.runner.key);
    if (art) {
      // Stamp to a scratch canvas first: the outline is traced from the stamped result, so
      // it has to follow whatever squash and lift this frame applied.
      const cw = w + PLAYER_PAD * 2;
      const ch = h + PLAYER_PAD * 2;
      const scratch = document.createElement('canvas');
      scratch.width = cw;
      scratch.height = ch;
      const sc = scratch.getContext('2d');
      const pad = PLAYER_PAD;
      if (crouch) stampRunnerArt(sc, art, w, h, { squashX: 1.06, squashY: 0.88, tilt: 0.08, pad });
      else stampRunnerArt(sc, art, w, h, squash ? { squashX: squash.x, squashY: squash.y, pad } : { pad });

      rimOutline(ctx, scratch, cw, ch, rim);
      ctx.drawImage(scratch, 0, 0);
      // Destination-over so the gray hat cannot be multiplied into the rim glow.
      //
      // 0.62 against the old 0.28: the rim itself is unchanged, and the halo is what does
      // the separating. Teal-on-cyan is a hue collision the rim alone kept losing — this is
      // the same background problem that hid the score, the checkpoint toast and the goal.
      // The shielded amber stays clearly the brighter of the two, or picking up a shield
      // would read as the character dimming.
      glowBehind(ctx, ox + w / 2, oy + h / 2, PLAYER_GLOW_R, rim, rim === COLORS.amber ? 0.8 : 0.62);
      return;
    }
    glowBlob(ctx, ox + w / 2, oy + h / 2, PLAYER_GLOW_R, rim, 0.62);

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
    // The goal was an arch of teal glow blobs, which is the same collision that hid the
    // score and the checkpoint toast: teal on a bright cyan cave. The most important object
    // in the level was the least visible thing in it.
    //
    // So it is amber now, and it is a giant version of the crystal the whole run has been
    // spent collecting — in theme by being made of the level's own subject rather than by
    // borrowing its colours, and legible because amber is the one hue this cave does not
    // already own.

    // Its own ground first. Same trick as the outlines: give it something to stand against
    // instead of asking it to win a fight with the background.
    ctx.beginPath();
    ctx.moveTo(15, h);
    ctx.lineTo(15, h * 0.46);
    ctx.quadraticCurveTo(15, 9, w / 2, 9);
    ctx.quadraticCurveTo(w - 15, 9, w - 15, h * 0.46);
    ctx.lineTo(w - 15, h);
    ctx.closePath();
    ctx.fillStyle = rgba(0x0a1020, 0.58);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.amber, 0.5);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const cy = h * 0.54;
    glowBlob(ctx, w / 2, cy, 56, COLORS.amber, 0.6);
    glowBlob(ctx, w / 2, cy, 26, 0xfff0cf, 0.65);

    // The prize itself, at roughly twice the size of a collectible.
    const art = sourceImage(scene, ART_FILES.crystal.key);
    if (art) {
      stampContained(ctx, art, w / 2 - 31, cy - 39, 62, 78);
    } else {
      polygon(ctx, [
        [w / 2, cy - 38],
        [w / 2 + 21, cy - 4],
        [w / 2, cy + 38],
        [w / 2 - 21, cy - 4]
      ]);
      ctx.fillStyle = rgba(COLORS.amber, 0.7);
      ctx.fill();
      ctx.strokeStyle = rgba(0xffffff, 0.85);
      ctx.lineWidth = 2;
      ctx.stroke();
      polygon(ctx, [[w / 2, cy - 38], [w / 2, cy + 38], [w / 2 - 21, cy - 4]]);
      ctx.fillStyle = rgba(0xffffff, 0.3);
      ctx.fill();
    }

    // Two shards at the outer feet, so it is rooted rather than floating. Four read as a
    // row of teeth under the arch, which is not the impression a finish line wants.
    for (const [x, half, tall] of [[24, 6, 22], [w - 24, 5, 18]]) {
      polygon(ctx, [[x, h - 6 - tall], [x + half, h - 6], [x - half, h - 6]]);
      ctx.fillStyle = rgba(COLORS.amber, 0.55);
      ctx.fill();
      ctx.strokeStyle = rgba(0xffe6b0, 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // A few motes rising off it.
    for (const [x, y, r] of [[w / 2 - 26, cy - 30, 3], [w / 2 + 24, cy - 18, 2.5], [w / 2 + 8, cy - 46, 2]]) {
      glowBlob(ctx, x, y, r * 3, 0xfff0cf, 0.8);
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
      glowBlob(ctx, w / 2, 14, 20, HAZARD_TONE.glow, 0.35);
      stampRecoloured(ctx, art, 0, 0, w, h, HAZARD_TONE);
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

/**
 * The hanging spike. Built from the same painted rock as the stalagmites and the ground
 * spikes — because it IS the same rock. The art is a cluster with one tall spike up the
 * middle; this lifts that spike out and flips it, so what hangs from the ceiling is the
 * identical material and lighting as everything else sharp in the level. Drawing it by hand
 * made it read flat and plainer than its neighbours no matter how the facets were faked.
 *
 * Drawn at 96x256 and displayed at 44x160. That is deliberate over-resolution: the source
 * spike narrows to a SINGLE pixel at its point, and squeezing 304 source rows into 160
 * texture rows crushed that taper into a stub four pixels wide for four rows before cutting
 * to nothing — a flat line across the tip. At 256 rows the taper keeps its detail and the
 * GPU does the final downscale smoothly. The canvas is 96 wide for the same reason: 114
 * source columns into 48 was squashing it to 0.42 horizontally against 0.53 vertically, so
 * the aspect was wrong as well. 96x256 matches the crop's own proportions.
 */
/**
 * The centre spike within spikes-rose.webp, measured rather than eyeballed: its tip is a
 * single pixel at row 4, x=192. The first attempt cropped from row 6 — two rows BELOW the
 * point — which after the flip put a flat cut edge across the bottom of the texture exactly
 * where the tip should be. Start at row 0 so the point arrives intact.
 */
const STALACTITE_CROP = [135, 0, 114, 304];

function makeStalactite(scene) {
  const w = 96;
  const h = 256;
  canvasTexture(scene, KEYS.stalactite, w, h, (ctx) => {
    const art = recolouredArt(sourceImage(scene, ART_FILES.spikes.key), HAZARD_TONE);
    if (art) {
      glowBlob(ctx, w / 2, h - 14, 30, HAZARD_TONE.glow, 0.7);
      const [sx, sy, sw, sh] = STALACTITE_CROP;
      ctx.save();
      ctx.translate(0, h);
      ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(art, sx, sy, sw, sh, 0, 0, w, h);
      ctx.restore();
      // The exact point the player has to clear is the brightest thing on it.
      glowBlob(ctx, w / 2, h - 4, 12, 0xe6e0ff, 0.8);
      return;
    }

    // No art: a hand-drawn spike, kept so the shape survives a missing asset.
    glowBlob(ctx, w / 2, h - 12, 30, HAZARD_TONE.glow, 0.75);
    polygon(ctx, [
      [w / 2 - 17, 0],
      [w / 2 + 17, 0],
      [w / 2 + 11, h * 0.34],
      [w / 2 + 5, h * 0.66],
      [w / 2 + 1, h],
      [w / 2 - 5, h * 0.7],
      [w / 2 - 10, h * 0.38]
    ]);
    ctx.fillStyle = hex(0x232a3a);
    ctx.fill();
    ctx.strokeStyle = rgba(HAZARD_TONE.glow, 1);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.strokeStyle = rgba(0xffffff, 0.6);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, h * 0.38);
    ctx.lineTo(w / 2 + 1, h - 2);
    ctx.stroke();
    glowBlob(ctx, w / 2, h - 4, 11, 0xe6e0ff, 0.85);
  });
}

/**
 * The big spike. Not the small one scaled up at render time — a separate texture with the
 * art drawn into it at size, at the art's own 375:384 proportions, so nothing is stretched.
 * The level places three of these overlapping instead of five small ones in a row: a row of
 * identical one-tile sprites reads as tiling, whereas three overlapping silhouettes read as
 * a ridge.
 *
 * 66px of body against the small spike's 15px, which is what makes it a real jump rather
 * than a hop. See the clearance rule in validate-level.mjs for the ceiling on how tall and
 * wide a cluster can get before it stops being clearable.
 */
function makeSpikeBig(scene) {
  const w = 72;
  const h = 74;
  canvasTexture(scene, KEYS.spikeBig, w, h, (ctx) => {
    const art = sourceImage(scene, ART_FILES.spikes.key);
    if (art) {
      glowBlob(ctx, w / 2, 16, 26, HAZARD_TONE.glow, 0.32);
      stampRecoloured(ctx, art, 0, 0, w, h, HAZARD_TONE);
      return;
    }
    glowBlob(ctx, w / 2, 16, 26, HAZARD_TONE.glow, 0.4);
    ctx.fillStyle = hex(0x232a3a);
    ctx.strokeStyle = rgba(HAZARD_TONE.glow, 0.9);
    ctx.lineWidth = 2;
    for (const [cx, tall] of [[16, 44], [36, 66], [56, 40]]) {
      polygon(ctx, [[cx - 12, h], [cx, h - tall], [cx + 12, h]]);
      ctx.fill();
      ctx.stroke();
    }
  });
}

function makeSpike(scene) {
  const w = 32;
  const h = 30;
  canvasTexture(scene, KEYS.spike, w, h, (ctx) => {
    const art = sourceImage(scene, ART_FILES.spikes.key);
    if (art) {
      glowBlob(ctx, w / 2, h - 6, 16, HAZARD_TONE.glow, 0.3);
      stampRecoloured(ctx, art, 0, 0, w, h, HAZARD_TONE);
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
    wrapBlendHorizontal(ctx, w, h, 48);
  });

  // Mid: painted cavern. The PNG is a unique 960x540 scene, not a tile. Wrapping it as a
  // TileSprite (even a POT, wrap-blended one) still puts a full-height seam on screen
  // because the left and right edges of the painting do not match. Mirror the cover-stamp
  // so the wrap is a reflection — seamless, PNG unchanged.
  const midArt = sourceImage(scene, ART_FILES.bgMid.key);
  if (midArt) {
    const midW = 2048;
    const midH = 512;
    canvasTexture(scene, KEYS.bgMid, midW, midH, (ctx, w, h) => {
      const half = w >> 1;
      stampCover(ctx, midArt, 0, 0, half, h);
      const tmp = document.createElement('canvas');
      tmp.width = half;
      tmp.height = h;
      tmp.getContext('2d').drawImage(ctx.canvas, 0, 0, half, h, 0, 0, half, h);
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
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
    const top = [];
    const bot = [];
    for (let x = 0; x <= w; x += 64) {
      top.push(10 + r() * 26);
      bot.push(12 + r() * 30);
    }
    top[top.length - 1] = top[0];
    bot[bot.length - 1] = bot[0];
    ctx.fillStyle = 'rgba(4,6,11,0.97)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < top.length; i++) ctx.lineTo(i * 64, top[i]);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < bot.length; i++) ctx.lineTo(i * 64, h - bot[i]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 4; i++) glowBlob(ctx, r() * w, h - 12 - r() * 20, 14, COLORS.teal, 0.18);
    wrapBlendHorizontal(ctx, w, h, 48);
  });
}

/**
 * The ground stride: compressed and wide on the footfall, stretched and narrow between.
 *
 * 4% against the jump tween's 20% — "far more subtle" was the brief, and at this size the
 * effect has to be felt as bounce rather than seen as deformation. Frame 0 is the
 * compressed one and the footfall sound fires on it, so the sound lands with the impact
 * rather than near it.
 */
const STRIDE_AMPLITUDE = 0.04;

function makeStrideFrames(scene) {
  for (let i = 0; i < STRIDE_FRAMES; i++) {
    const c = Math.cos((i / STRIDE_FRAMES) * Math.PI * 2);
    const squash = { x: 1 + STRIDE_AMPLITUDE * c, y: 1 - STRIDE_AMPLITUDE * c };
    makePlayer(scene, strideKey(i, false), { squash });
    makePlayer(scene, strideKey(i, true), { squash, rim: COLORS.amber });
  }
}

/**
 * Packs every wall and feature panel into ONE texture with named frames.
 *
 * The wall is built by laying painted panels side by side, and there are 48 of them. Left
 * as 48 separate textures, two neighbouring panels almost never share one, and every
 * texture switch flushes Phaser's sprite batch — a wall of 340 panels would cost something
 * close to 340 draw calls on a phone. Packed into a single atlas the whole wall is one
 * batch.
 *
 * Panels are ~112px tall, so a few rows of 2048 hold all of them well inside the 4096
 * limit even old mobile GPUs guarantee. The underhang pieces ride in the same atlas for the
 * same reason: three layers of them across every platform is a lot of quads to draw, and
 * they are worth nothing if each one costs a batch flush.
 */
const WALL_COUNT = 39;
const PANEL_COUNT = 9;
const EDGE_R = ['edge-r-a:12', 'edge-r-b:12', 'edge-r-c:12'];
const EDGE_L = ['edge-l-a:13', 'edge-l-b:13', 'edge-l-c:12'];
const FAR_COUNT = 12;
const MID_COUNT = 12;
const NEAR_COUNT = 16;
/**
 * Corner mounds, derived from the pit-edge columns rather than drawn.
 *
 * The pit edges broke up the lower two thirds of every platform end but not the corner
 * itself: measured across all 72 of them, alpha coverage runs 23-32% in the top quarter
 * against 28-44% through the middle. They are hanging columns, thin exactly where the
 * walking surface turns and drops. A sheet of purpose-drawn shoulders was commissioned and
 * came back as a rubble fringe with 0-2% coverage in its top band — the opposite of what a
 * corner needs — so the mass is taken from the columns' own dense middle instead.
 *
 * Two rules shape the mask, and both come from things that have already gone wrong here.
 *
 * NO STRAIGHT BOUNDARY ANYWHERE. Cropping a band out of a painted piece gives a rectangle
 * of rock with four hard edges, which reads as a pasted block — the same failure as every
 * other straight line in this level. The band is masked by a smooth window in both axes, so
 * its outline is a soft mound and there is no edge to see. The texture inside stays painted;
 * only the silhouette is procedural, which is the division that has worked every time.
 *
 * NOTHING OVERHANGS AT THE WALKING SURFACE. Beyond the platform's true edge the mask starts
 * LIP_CLEAR rows lower, ramped in over a few pixels. A player must never see ground that is
 * not there, and this is cheaper to guarantee here than to verify in art.
 */
const CORNER_BAND_FROM = 42;
const CORNER_BAND_H = 50;
const CORNER_LIP_CLEAR = 9;
const CORNER_EDGE_FRAC = 0.5;

function makeCorner(img, right) {
  const W = img.width;
  const H = CORNER_BAND_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, CORNER_BAND_FROM, W, H, 0, 0, W, H);

  const d = ctx.getImageData(0, 0, W, H);
  const edge = W * CORNER_EDGE_FRAC;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  for (let y = 0; y < H; y++) {
    // In: fades up under the moss. Out: dissolves down into the column already there.
    const wyTop = smooth(y / 7);
    const wyBot = smooth((H - y) / (H * 0.45));
    for (let x = 0; x < W; x++) {
      // Distance from the inner end, so the mound thins back along the platform and again
      // as it reaches out over the pit. Longer fade on the inner side: it has rock to melt
      // into, while the outer side is a silhouette against open cave and must stay crisp.
      const u = right ? x / W : (W - 1 - x) / W;
      const wx = smooth(u / 0.34) * smooth((1 - u) / 0.16);

      // The safety rule, as a shape: past the true edge the rock starts lower down.
      const beyond = right ? x - edge : edge - x;
      const clear = beyond <= 0 ? 0 : CORNER_LIP_CLEAR * smooth(beyond / 7);
      const wLip = smooth((y - clear) / 5);

      const i = (y * W + x) * 4;
      d.data[i + 3] *= wyTop * wyBot * wx * wLip;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/**
 * The cap that goes over the tip of a platform end.
 *
 * The pit corner is a right angle because it is one: the ground tile is a 32px square and
 * the moss lip stops dead at its edge. Everything the dressing adds sits *below* the lip,
 * by design — the old rule was that nothing may overhang the walking surface — so the one
 * pixel that actually needed covering was the one pixel guaranteed to stay bare. Every
 * previous attempt dressed the face and left the corner untouched.
 *
 * This is the fix stated plainly: a small rounded lobe of painted rock, laid over the tip,
 * hiding the last of the moss and the top of the vertical edge. Its outline is a radius
 * modulated by three odd harmonics of the angle, so it is round without being a circle and
 * has no straight run anywhere on it, and the alpha ramps to nothing over the outer third
 * so it has no edge of its own to see. The texture inside is the painted rock, untouched —
 * painted texture, procedural silhouette, which is the only division that has worked here.
 *
 * It does overhang, a little. That is deliberate and it is what was asked for: the lobe is
 * dark rock reading as mass below the corner, never as surface, and CAP_OVER keeps it
 * short enough that no one will try to stand on it.
 */
const CAP_W = 36;
const CAP_H = 34;
const CAP_SRC_H = 52; // rows of the edge column to sample

/**
 * Pick the densest band of the source column.
 *
 * The pit-edge sheets are ragged: a fixed sample window landed on rows that were mostly
 * holes, and the first caps came out at a mean alpha of 46/255 — a ghost laid over the
 * corner, which is exactly as good as nothing. Measuring instead of assuming costs one
 * pass over the image at boot and makes the cap solid whichever sheet it is cut from.
 */
function densestBand(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const rowA = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) s += d[(y * w + x) * 4 + 3];
    rowA[y] = s / w;
  }
  let best = 0;
  let bestSum = -1;
  for (let y = 0; y + CAP_SRC_H <= h; y++) {
    let s = 0;
    for (let k = 0; k < CAP_SRC_H; k++) s += rowA[y + k];
    if (s > bestSum) {
      bestSum = s;
      best = y;
    }
  }
  return best;
}

function makeTipCap(img, right, seed) {
  const meas = document.createElement('canvas');
  meas.width = img.width;
  meas.height = img.height;
  const mctx = meas.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(img, 0, 0);
  const from = densestBand(mctx, img.width, img.height);

  const c = document.createElement('canvas');
  c.width = CAP_W;
  c.height = CAP_H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const sh = Math.min(img.height - from, CAP_SRC_H);
  const put = (dx, dy) => ctx.drawImage(img, 0, from, img.width, sh, dx, dy, CAP_W, CAP_H);
  // Three offset passes. Painted rock over painted rock keeps the colour but compounds the
  // alpha (1-(1-a)^n), and the offsets fill the pinholes a single pass leaves behind. The
  // lobe has to be opaque enough to actually hide the corner under it; a translucent one
  // just tints the right angle instead of covering it.
  put(0, 0);
  put(right ? 2 : -2, 1);
  put(right ? -1 : 1, -2);
  if (right) {
    // Mirror, so the two ends of a pit are not the same rock twice.
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, CAP_W, 0);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  const d = ctx.getImageData(0, 0, CAP_W, CAP_H);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const p1 = seed * 1.7;
  const p2 = seed * 2.9 + 1.1;
  const p3 = seed * 4.3 + 2.7;
  for (let y = 0; y < CAP_H; y++) {
    for (let x = 0; x < CAP_W; x++) {
      const u = (x + 0.5) / CAP_W * 2 - 1;
      const v = (y + 0.5) / CAP_H * 2 - 1;
      const r = Math.hypot(u, v);
      const a = Math.atan2(v, u);
      // Odd harmonics only: an even one would make the lobe symmetric about its own axis,
      // which reads as a drawn shape rather than as a piece of rock.
      const R =
        1 + 0.20 * Math.sin(3 * a + p1) + 0.12 * Math.sin(5 * a + p2) + 0.07 * Math.sin(7 * a + p3);
      const i = (y * CAP_W + x) * 4;
      d.data[i + 3] *= smooth((R - r) / (R * 0.42));
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function makeWallAtlas(scene) {
  const names = [
    ...Array.from({ length: WALL_COUNT }, (_, i) => [`w${i}`, ART_FILES[`wall${i}`].key]),
    ...Array.from({ length: PANEL_COUNT }, (_, i) => [`p${i}`, ART_FILES[`panel${i}`].key]),
    ...Array.from({ length: FAR_COUNT }, (_, i) => [`f${i}`, ART_FILES[`far${i}`].key]),
    ...Array.from({ length: MID_COUNT }, (_, i) => [`m${i}`, ART_FILES[`mid${i}`].key]),
    ...Array.from({ length: NEAR_COUNT }, (_, i) => [`n${i}`, ART_FILES[`near${i}`].key]),
    ...EDGE_R.flatMap((spec, gi) => {
      const n = Number(spec.split(':')[1]);
      return Array.from({ length: n }, (_, i) => [`er${gi}_${i}`, ART_FILES[`edgeR_${gi}_${i}`].key]);
    }),
    ...Array.from({ length: 8 }, (_, i) => [`rr${i}`, ART_FILES[`rubbleR${i}`].key]),
    ...Array.from({ length: 9 }, (_, i) => [`rl${i}`, ART_FILES[`rubbleL${i}`].key]),
    ...EDGE_L.flatMap((spec, gi) => {
      const n = Number(spec.split(':')[1]);
      return Array.from({ length: n }, (_, i) => [`el${gi + 3}_${i}`, ART_FILES[`edgeL_${gi + 3}_${i}`].key]);
    })
  ];
  const imgs = names.map(([frame, key]) => ({ frame, img: sourceImage(scene, key) })).filter((e) => e.img);
  if (!imgs.length) return;

  // Corner mounds, built from the pit-edge columns. Same atlas, so they cost no draw calls.
  const edgeImgs = (p) => imgs.filter((e) => e.frame.startsWith(p)).map((e) => e.img);
  edgeImgs('er').forEach((im, i) => { if (i < 14) imgs.push({ frame: `cr${i}`, img: makeCorner(im, true) }); });
  edgeImgs('el').forEach((im, i) => { if (i < 14) imgs.push({ frame: `cl${i}`, img: makeCorner(im, false) }); });

  // Tip caps, from the same columns. One per side per frame; the mirror inside makeTipCap
  // keeps the left and right ends of the same pit from showing identical rock.
  edgeImgs('er').forEach((im, i) => { if (i < 10) imgs.push({ frame: `tr${i}`, img: makeTipCap(im, true, i + 1) }); });
  edgeImgs('el').forEach((im, i) => { if (i < 10) imgs.push({ frame: `tl${i}`, img: makeTipCap(im, false, i + 7) }); });

  const MAX_W = 2048;
  const PAD = 1; // transparent gutter, so bilinear sampling cannot bleed one panel into the next
  const rows = [];
  let row = { items: [], w: 0, h: 0 };
  for (const e of imgs) {
    if (row.w + e.img.width + PAD > MAX_W && row.items.length) {
      rows.push(row);
      row = { items: [], w: 0, h: 0 };
    }
    row.items.push({ ...e, x: row.w });
    row.w += e.img.width + PAD;
    row.h = Math.max(row.h, e.img.height);
  }
  if (row.items.length) rows.push(row);

  const atlasW = Math.max(...rows.map((r) => r.w));
  const atlasH = rows.reduce((acc, r) => acc + r.h + PAD, 0);
  const placed = [];
  canvasTexture(scene, KEYS.wallAtlas, atlasW, atlasH, (ctx) => {
    let y = 0;
    for (const r of rows) {
      for (const it of r.items) {
        ctx.drawImage(it.img, it.x, y);
        placed.push({ frame: it.frame, x: it.x, y, w: it.img.width, h: it.img.height });
      }
      y += r.h + PAD;
    }
  });

  const tex = scene.textures.get(KEYS.wallAtlas);
  for (const pl of placed) tex.add(pl.frame, 0, pl.x, pl.y, pl.w, pl.h);
}

/** Build every runtime texture. Called once, from PreloadScene. */
export function generateTextures(scene, viewHeight) {
  makePlayer(scene, KEYS.player);
  makeStrideFrames(scene);
  makePlayer(scene, KEYS.playerJump, { crouch: true });
  makePlayer(scene, KEYS.playerShield, { rim: COLORS.amber });
  makePlayer(scene, KEYS.playerJumpShield, { crouch: true, rim: COLORS.amber });
  makeWallAtlas(scene);
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
  makeSpikeBig(scene);
  makeSpike(scene);
  makeGlow(scene);
  makeParallax(scene, viewHeight);
}
