/**
 * Are there straight lines along the platform lips, and is every pit corner covered?
 *
 * Two checks, both of which caught real bugs that eyeballing did not:
 *
 * 1. COVERAGE. Every corner in the tilemap must have a tip cap on it. Corners are read
 *    from the map (ground_top gid 1 / ledge_top gid 5 with a higher or absent neighbour),
 *    not from what the dressing happened to place, so a corner the dressing skips is
 *    caught rather than being invisible to a check that only looks at what exists.
 *    Note the ceiling occupies row 0 of every column: scanning for the topmost solid tile
 *    finds it, reports two corners for the whole level, and passes for the wrong reason.
 *
 * 2. RULED ROWS. Along a stretch of face, the fraction of columns whose vertical gradient
 *    exceeds twice the strip mean, per row. Rock noise sits near 25%; a drawn line puts
 *    most of the row over the threshold. The rows straddling the lip are inherently high
 *    (that boundary is the collision plane, which really is straight) so they are reported
 *    rather than failed; anything below lip+1 going over FACE_LIMIT is a new ruled line
 *    and fails, which is how the wall-panel cornice and the feature-panel edge were found.
 *
 * Usage: node tools/check-lip.mjs [--url http://localhost:4173]
 */
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const zlib = require('node:zlib');
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:4173';
const FACE_LIMIT = 0.4;
const WALL_MIN_SPREAD = 0.8; // px/row the pit-wall edge must move; ~0 is a ruled line
const SEAM_LIMIT = 40;

function decode(buf) {
  let p = 8;
  const idat = [];
  let w, h, ct;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const t = buf.toString('ascii', p + 4, p + 8);
    if (t === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); ct = buf[p + 17]; }
    if (t === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, stride, out };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
});
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/?n=${Date.now()}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Menu'), null, { timeout: 20000 });
await page.mouse.click(422, 195);
await page.waitForFunction(() => window.__game.scene.isActive('Game'), null, { timeout: 20000 });
await page.waitForTimeout(1200);

const coverage = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const TILE = 32;
  s.physics.world.pause();
  s.cameras.main.stopFollow();
  for (const c of s.children.list) if (c.type === 'Text') c.setVisible(false);
  const layer = s.ground;
  const W = layer.layer.width;
  const H = layer.layer.height;
  const topOf = (x) => {
    for (let y = 0; y < H; y++) {
      const t = layer.getTileAt(x, y);
      if (t && (t.index === 1 || t.index === 5)) return y;
    }
    return Infinity;
  };
  const tops = Array.from({ length: W }, (_, x) => topOf(x));
  const corners = [];
  for (let x = 0; x < W; x++) {
    if (!isFinite(tops[x])) continue;
    const l = x > 0 ? tops[x - 1] : Infinity;
    const r = x < W - 1 ? tops[x + 1] : Infinity;
    if (l > tops[x] && x > 1) corners.push({ side: 'L', tx: x, x: x * TILE, lipY: tops[x] * TILE });
    if (r > tops[x] && x < W - 2) corners.push({ side: 'R', tx: x, x: (x + 1) * TILE, lipY: tops[x] * TILE });
  }
  const caps = s.children.list.filter((o) => o.frame && /^t[lr]\d/.test(String(o.frame.name)));
  const bare = corners.filter((c) => !caps.some((o) => Math.abs(o.x - c.x) <= 22 && Math.abs(o.y - c.lipY) <= 22));
  return { total: corners.length, bare: bare.map((c) => `${c.side}@tile${c.tx}`), sample: corners.filter((_, i) => i % 6 === 0).slice(0, 8) };
});

await page.evaluate(() => {
  const s = window.__game.scene.getScene('Game');
  const cam = s.cameras.main;
  cam.scrollX = 300 * 32;
  cam.scrollY = Math.max(0, 14 * 32 - 120);
  s.player.setPosition(300 * 32 - 4000, 300);
});
await page.waitForTimeout(400);
const clip = await page.evaluate(() => {
  const g = window.__game;
  const cam = g.scene.getScene('Game').cameras.main;
  const r = g.canvas.getBoundingClientRect();
  const k = g.scale.displaySize.width / g.scale.gameSize.width;
  return { x: r.left + 40 * k, y: r.top + (14 * 32 - 8 - cam.scrollY) * k, width: 760 * k, height: 44 * k };
});
const { w, h, bpp, stride, out } = decode(await page.screenshot({ clip }));
const lum = (x, y) =>
  0.2126 * out[y * stride + x * bpp] + 0.7152 * out[y * stride + x * bpp + 1] + 0.0722 * out[y * stride + x * bpp + 2];
const grads = [];
let total = 0;
for (let y = 1; y < h - 1; y++) {
  const row = [];
  for (let x = 0; x < w; x++) {
    const d = Math.abs(lum(x, y + 1) - lum(x, y - 1));
    row.push(d);
    total += d;
  }
  grads.push(row);
}
const mean = total / (grads.length * w);
const rows = grads.map((row, i) => ({ rel: i + 1 - 8, frac: row.filter((d) => d > 2 * mean).length / row.length }));

console.log(`pit corners: ${coverage.total}, uncapped: ${coverage.bare.length}${coverage.bare.length ? ' -> ' + coverage.bare.slice(0, 10).join(' ') : ''}`);
const lip = rows.filter((r) => r.rel >= -4 && r.rel <= 1);
console.log(`lip rows (inherent, the collision plane): ${lip.map((r) => `${r.rel}:${(r.frac * 100).toFixed(0)}%`).join(' ')}`);
const face = rows.filter((r) => r.rel > 1 && r.frac > FACE_LIMIT);
console.log(`face rows over ${FACE_LIMIT * 100}%: ${face.length}${face.length ? ' -> ' + face.map((r) => `lip+${r.rel}:${(r.frac * 100).toFixed(0)}%`).join(' ') : ''}`);

// 3. THE PIT WALL. How far the rock's outer edge wanders down the drop below each corner.
//    Covering the corner tip left this untouched, and it is the longest straight line at a
//    pit: the pit-edge column is one frame stretched over the whole face, and stretching
//    art cannot make a broken edge. Measured as a spread in pixels, not as "fraction of
//    rows on the median column" — with a boundary that only moves a few pixels either way,
//    that fraction reads high for ragged and ruled alike, and three rounds of tuning
//    against it moved nothing.
const spreads = [];
for (const c of coverage.sample) {
  await page.evaluate((s0) => {
    const sc = window.__game.scene.getScene('Game');
    const cam = sc.cameras.main;
    cam.scrollX = s0.x - 400;
    cam.scrollY = Math.max(0, s0.lipY - 100);
    sc.player.setPosition(s0.x - 4000, 300);
  }, c);
  await page.waitForTimeout(90);
  const wbox = await page.evaluate((s0) => {
    const g = window.__game;
    const cam = g.scene.getScene('Game').cameras.main;
    const r = g.canvas.getBoundingClientRect();
    const k = g.scale.displaySize.width / g.scale.gameSize.width;
    return { x: r.left + (s0.x - 26 - cam.scrollX) * k, y: r.top + (s0.lipY + 26 - cam.scrollY) * k, width: 52 * k, height: 130 * k };
  }, c);
  const im = decode(await page.screenshot({ clip: wbox }));
  const wl = (x, y) =>
    0.2126 * im.out[y * im.stride + x * im.bpp] + 0.7152 * im.out[y * im.stride + x * im.bpp + 1] + 0.0722 * im.out[y * im.stride + x * im.bpp + 2];
  const seq = [];
  for (let y = 0; y < im.h; y++) {
    let lo = 255;
    let hi = 0;
    for (let x = 0; x < im.w; x++) { const v = wl(x, y); if (v < lo) lo = v; if (v > hi) hi = v; }
    const T = (lo + hi) / 2;
    for (let x = im.w - 1; x >= 0; x--) if (wl(x, y) < T) { seq.push(x); break; }
  }
  // Roughness, in pixels per row, IN ROW ORDER. The p90-p10 spread does not discriminate:
  // one long smooth bulge scores as high as a rocky outline, so it passed unchanged with
  // the wall art removed entirely. How far the edge moves from each row to the next is
  // what separates a ruled line (near 0) from rock.
  let rough = 0;
  for (let i = 1; i < seq.length; i++) rough += Math.abs(seq[i] - seq[i - 1]);
  spreads.push({ c, spread: seq.length > 1 ? rough / (seq.length - 1) : 0 });
}
const ruledWalls = spreads.filter((s0) => s0.spread <= WALL_MIN_SPREAD);
console.log(`pit walls sampled: ${spreads.length}, edge roughness ${spreads.map((s0) => s0.spread.toFixed(1)).join(' ')} px/row`);

// 4. VERTICAL SEAMS on the face, where one wall panel meets the next.
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Game');
  const cam = sc.cameras.main;
  cam.scrollX = 300 * 32;
  cam.scrollY = Math.max(0, 14 * 32 - 120);
  sc.player.setPosition(300 * 32 - 4000, 300);
});
await page.waitForTimeout(300);
const sbox = await page.evaluate(() => {
  const g = window.__game;
  const cam = g.scene.getScene('Game').cameras.main;
  const r = g.canvas.getBoundingClientRect();
  const k = g.scale.displaySize.width / g.scale.gameSize.width;
  return { x: r.left + 60 * k, y: r.top + (14 * 32 + 14 - cam.scrollY) * k, width: 720 * k, height: 90 * k };
});
const si = decode(await page.screenshot({ clip: sbox }));
const sl = (x, y) =>
  0.2126 * si.out[y * si.stride + x * si.bpp] + 0.7152 * si.out[y * si.stride + x * si.bpp + 1] + 0.0722 * si.out[y * si.stride + x * si.bpp + 2];
let stot = 0;
const scols = [];
for (let x = 1; x < si.w - 1; x++) {
  const col = [];
  for (let y = 0; y < si.h; y++) { const d = Math.abs(sl(x + 1, y) - sl(x - 1, y)); col.push(d); stot += d; }
  scols.push(col);
}
const smean = stot / (scols.length * si.h);
const seams = scols.filter((col) => col.filter((d) => d > 2 * smean).length / si.h > 0.4).length;
console.log(`vertical seams on the face: ${seams} of ${scols.length} columns`);

const problems = [];
if (ruledWalls.length) problems.push(`${ruledWalls.length} pit wall(s) with a ruled vertical edge`);
if (seams > SEAM_LIMIT) problems.push(`${seams} vertical seams on the face (limit ${SEAM_LIMIT})`);
if (coverage.bare.length) problems.push(`${coverage.bare.length} pit corner(s) with no cap`);
if (face.length) problems.push(`${face.length} ruled row(s) on the face`);
if (errors.length) problems.push(`page errors: ${errors.join('; ')}`);
await browser.close();
if (problems.length) {
  console.error('\nlip check FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('\nlip check passed');
