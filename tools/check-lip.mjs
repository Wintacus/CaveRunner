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
  return { total: corners.length, bare: bare.map((c) => `${c.side}@tile${c.tx}`) };
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

const problems = [];
if (coverage.bare.length) problems.push(`${coverage.bare.length} pit corner(s) with no cap`);
if (face.length) problems.push(`${face.length} ruled row(s) on the face`);
if (errors.length) problems.push(`page errors: ${errors.join('; ')}`);
await browser.close();
if (problems.length) {
  console.error('\nlip check FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('\nlip check passed');
