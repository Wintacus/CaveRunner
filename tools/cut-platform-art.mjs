/**
 * Cuts the painted platform sheets in art-incoming/ into individual assets.
 *
 * The sheets arrive as RGB on pure black with no alpha, so the background has to be
 * derived. It is derived by FLOOD FILL from the image borders, not by a luminance key:
 * the rock in this kit is nearly as dark as the black behind it, so keying on brightness
 * eats the rock and leaves the glowing bits floating. A fill from the edges only removes
 * black that is actually connected to the outside.
 *
 * Runs in Chromium because that is the only image decoder available here; the same reason
 * tools/smoke-test.mjs does.
 *
 * Usage: node tools/cut-platform-art.mjs [--list]
 *   --list   report the components it finds and their boxes, and write nothing
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// The source sheets live on the `art-drop` branch under art-incoming/. They are not on
// this branch: they are 11MB of 1536x1024 masters whose only consumer is this script, and
// the 116KB of cut output it produces is what the game actually loads. To re-run this,
// check out art-drop into a worktree and point ART_SRC at its art-incoming/.
const SRC = process.env.ART_SRC || 'art-incoming';
const OUT = path.resolve('public/assets/art/platform');
const listOnly = process.argv.includes('--list');

// Sheets 01 and 04 were the first pass at face fills and hero panels. Sheet 07 supersedes
// both: 39 face-on wall panels, every one with a matching painted stone cap, against 01's
// four strips and 04's three. 02 is a pair of horizontal top caps the tilemap's own lip
// already covers.
const SHEETS = [
  '03-overlays-fungus-drips-streaks.png',
  '09-underhang-far.png',
  '10-underhang-mid.png',
  '11-underhang-near.png',
  '05-family-sheet-1.png',
  '06-family-sheet-2.png',
  '07-family-sheet-3.png'
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
});
const page = await browser.newPage();

// Target sizes, in the units the game draws in. `h` pins a height; `s` is a flat scale.
// The ground face below the lip is 3 tiles (96px) and a ledge's is 2 (64px), so the face
// and hero strips are baked at 112 and cropped down per platform rather than squashed.
// `trim` is the fraction of the piece's height cut off the TOP. The painted strips each
// carry their own pale stone cap, and the moss lip on the tilemap is the cue the player
// reads platform edges by — covering it with a second, mossless lip would cost readability
// for decoration. The strips are cropped to pure face and drawn below the existing lip.
const TARGET = {
  '03-overlays-fungus-drips-streaks.png': { s: 1 / 8 },
  '05-family-sheet-1.png': { h: 112, feather: 6, featherTop: 10 },
  '06-family-sheet-2.png': { h: 112, feather: 6, featherTop: 10 },
  // Sheet 07's strips keep their painted stone cap. Drawn starting just under the moss it
  // becomes a cornice between the moss and the face, which is how the art is drawn; the
  // earlier strips were trimmed only because their caps were pale enough to read as a
  // second, mossless lip.
  '07-family-sheet-3.png': { h: 112, feather: 6 },
  // Underhangs. Each piece is roughly 40% platform face and 60% hang, so a target height of
  // 96 puts about 38px over the face and 58px below it, against a bedrock face of 119px and
  // a ledge's 87px. Their side edges come already feathered, so no more is added here.
  '09-underhang-far.png': { h: 96 },
  '10-underhang-mid.png': { h: 96 },
  '11-underhang-near.png': { h: 104 }
};

/** Foreground dilation radius, per sheet. See the note beside its use. */
const DILATE = { '07-family-sheet-3.png': 2, '11-underhang-near.png': 2 };
const work = SHEETS.map((f) => ({ name: f, b64: fs.readFileSync(path.join(SRC, f)).toString('base64'), target: TARGET[f], dilate: DILATE[f] }));

const result = await page.evaluate(async (sheets) => {
  const out = [];
  for (const sheet of sheets) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + sheet.b64;
    await img.decode();
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H);
    const px = d.data;

    // --- background --------------------------------------------------------------
    // Sheets arrive one of two ways. The early ones were RGB on pure black, where the
    // background has to be derived. The underhang sheets carry real alpha, and there the
    // alpha IS the answer and must be used verbatim: those pieces fade out along their top
    // edges on purpose, and re-deriving a mask would flatten exactly the soft edge that
    // makes them work.
    let preKeyed = false;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] > 4 && px[i] < 250) { preKeyed = true; break; }
    }

    const bg = new Uint8Array(W * H);
    if (preKeyed) {
      for (let p = 0; p < W * H; p++) bg[p] = px[p * 4 + 3] < 8 ? 1 : 0;
    } else {
      floodFillBackground();
    }

    function floodFillBackground() {
    const BG = 8; // max channel value still considered background
    const isDark = (i) => px[i] <= BG && px[i + 1] <= BG && px[i + 2] <= BG;
    const stack = [];
    for (let x = 0; x < W; x++) { stack.push(x, x + (H - 1) * W); }
    for (let y = 0; y < H; y++) { stack.push(y * W, W - 1 + y * W); }
    while (stack.length) {
      const p = stack.pop();
      if (bg[p]) continue;
      if (!isDark(p * 4)) continue;
      bg[p] = 1;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    }

    // --- close the foreground before labelling ------------------------------------
    // The rock is dark enough that the fill still nibbles into it, leaving each painted
    // strip shattered into a big piece plus thirty fragments of its brighter details.
    // Dilating the foreground bridges those internal gaps so one strip labels as one
    // component; the crop below still uses the ORIGINAL mask, so nothing is fattened in
    // the output.
    //
    // The radius is per-sheet: it has to be large enough to bridge the dark gaps inside one
    // piece and smaller than the gap between two. Sheet 07 packs its strips far closer
    // together than the rest, and 6 fused neighbours into single 179px blobs there.
    const R = sheet.dilate || 6;
    const dil = new Uint8Array(W * H);
    {
      const tmp = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        let run = -1;
        for (let x = 0; x < W; x++) if (!bg[x + y * W]) run = x;
        void run;
        for (let x = 0; x < W; x++) {
          let on = 0;
          for (let k = -R; k <= R && !on; k++) {
            const xx = x + k;
            if (xx >= 0 && xx < W && !bg[xx + y * W]) on = 1;
          }
          tmp[x + y * W] = on;
        }
      }
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
          let on = 0;
          for (let k = -R; k <= R && !on; k++) {
            const yy = y + k;
            if (yy >= 0 && yy < H && tmp[x + yy * W]) on = 1;
          }
          dil[x + y * W] = on;
        }
      }
    }

    // --- components over the closed foreground -------------------------------------
    const seen = new Uint8Array(W * H);
    const comps = [];
    for (let p0 = 0; p0 < W * H; p0++) {
      if (!dil[p0] || seen[p0]) continue;
      let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
      const st = [p0];
      seen[p0] = 1;
      while (st.length) {
        const p = st.pop();
        const x = p % W, y = (p / W) | 0;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        const push = (q) => { if (dil[q] && !seen[q]) { seen[q] = 1; st.push(q); } };
        if (x > 0) push(p - 1);
        if (x < W - 1) push(p + 1);
        if (y > 0) push(p - W);
        if (y < H - 1) push(p + W);
      }
      if (n > 4000) comps.push({ x0, y0, x1, y1, n, target: sheet.target });
    }
    comps.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));

    // --- crop each component out, with alpha --------------------------------------
    const cuts = comps.map((k) => {
      const trimPx = Math.round((k.y1 - k.y0 + 1) * (k.target.trim || 0));
      const w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1 - trimPx;
      const cc = document.createElement('canvas');
      cc.width = w; cc.height = h;
      const cx = cc.getContext('2d');
      const outImg = cx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sp = (k.x0 + x) + (k.y0 + trimPx + y) * W;
          const si = sp * 4, di = (y * w + x) * 4;
          outImg.data[di] = px[si];
          outImg.data[di + 1] = px[si + 1];
          outImg.data[di + 2] = px[si + 2];
          // Background pixels go transparent. Foreground keeps full alpha, except the
          // darkest fringe, which is faded so the cut edge is not a hard line.
          if (preKeyed) outImg.data[di + 3] = px[si + 3];
          else if (bg[sp]) outImg.data[di + 3] = 0;
          else {
            const v = Math.max(px[si], px[si + 1], px[si + 2]);
            outImg.data[di + 3] = v < 26 ? Math.round((v / 26) * 255) : 255;
          }
        }
      }
      cx.putImageData(outImg, 0, 0);

      // --- recolour the stone, leave the glow alone --------------------------------
      // Measured on the source: the rock sits at hue 20-69 (48% of pixels) and the
      // bioluminescence at hue 160-209 (37%). They do not overlap, so the stone can be
      // rotated to the cave's blue without touching a single glowing pixel. A blanket HSL
      // remap like the one the spikes use would have turned the mushrooms brown.
      const CAVE_HUE = 212;
      const im2 = cx.getImageData(0, 0, w, h);
      const q = im2.data;
      for (let i = 0; i < q.length; i += 4) {
        if (q[i + 3] === 0) continue;
        const R = q[i] / 255, G = q[i + 1] / 255, B = q[i + 2] / 255;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx === mn) continue;
        const l = (mx + mn) / 2;
        const sat = l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
        let hh;
        if (mx === R) hh = (G - B) / (mx - mn) + (G < B ? 6 : 0);
        else if (mx === G) hh = (B - R) / (mx - mn) + 2;
        else hh = (R - G) / (mx - mn) + 4;
        hh *= 60;
        const warm = hh < 90 || hh > 340;
        if (!warm) continue;
        // Keep the spread inside the warm band so the painted variation survives the move.
        const t = Math.min(1, Math.max(0, ((hh > 340 ? hh - 360 : hh) - 15) / 55));
        const nh = (CAVE_HUE - 8 + t * 20) / 360;
        const hue2rgb = (pp, qq, tt) => {
          if (tt < 0) tt += 1; if (tt > 1) tt -= 1;
          if (tt < 1 / 6) return pp + (qq - pp) * 6 * tt;
          if (tt < 1 / 2) return qq;
          if (tt < 2 / 3) return pp + (qq - pp) * (2 / 3 - tt) * 6;
          return pp;
        };
        const q2 = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
        const p2 = 2 * l - q2;
        q[i] = Math.round(hue2rgb(p2, q2, nh + 1 / 3) * 255);
        q[i + 1] = Math.round(hue2rgb(p2, q2, nh) * 255);
        q[i + 2] = Math.round(hue2rgb(p2, q2, nh - 1 / 3) * 255);
      }
      cx.putImageData(im2, 0, 0);

      // --- bake at display size -----------------------------------------------------
      // Same doctrine as every other texture here: draw it at the size it is shown, so the
      // GPU never resamples it at runtime.
      const scale = k.target.h ? k.target.h / h : k.target.s;
      const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
      const sc = document.createElement('canvas');
      sc.width = dw; sc.height = dh;
      const sx2 = sc.getContext('2d');
      sx2.imageSmoothingEnabled = true; sx2.imageSmoothingQuality = 'high';
      sx2.drawImage(cc, 0, 0, dw, dh);

      // Feather the left and right edges to transparent. The wall is built by laying these
      // side by side, and each was cut as its own tile on the sheet with its own dark
      // border, so butting two together drew a hard vertical line down the rock every
      // panel-width — a grid, in art that is supposed to be one continuous wall. Placement
      // overlaps neighbours by this same width so the two ramps cross-fade instead.
      const FT = k.target.featherTop || 0;
      if (FT > 0 && dh > FT) {
        const td = sx2.getImageData(0, 0, dw, dh);
        for (let y = 0; y < FT; y++) {
          const t = (y + 0.5) / FT;
          for (let xx = 0; xx < dw; xx++) td.data[(y * dw + xx) * 4 + 3] *= t;
        }
        sx2.putImageData(td, 0, 0);
      }

      const F = k.target.feather || 0;
      if (F > 0 && dw > F * 2) {
        const fd = sx2.getImageData(0, 0, dw, dh);
        for (let y = 0; y < dh; y++) {
          for (let i = 0; i < F; i++) {
            const t = (i + 0.5) / F;
            fd.data[(y * dw + i) * 4 + 3] *= t;
            fd.data[(y * dw + (dw - 1 - i)) * 4 + 3] *= t;
          }
        }
        sx2.putImageData(fd, 0, 0);
      }

      return { box: k, w: dw, h: dh, url: sc.toDataURL('image/webp', 0.92) };
    });
    out.push({ sheet: sheet.name, W, H, cuts: cuts.map((c) => ({ ...c.box, w: c.w, h: c.h, url: c.url })) });
  }
  return out;
}, work);

await browser.close();

for (const s of result) {
  console.log(`\n${s.sheet}  (${s.W}x${s.H})  ${s.cuts.length} pieces`);
  s.cuts.forEach((k, i) =>
    console.log(`  [${i}] out ${String(k.w).padStart(3)}x${String(k.h).padStart(3)}  from ${k.x0},${k.y0}  ${k.n} px`));
}

if (!listOnly) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of result) {
    const stem = s.sheet.replace(/^\d+-/, '').replace(/\.png$/, '');
    s.cuts.forEach((k, i) => {
      const buf = Buffer.from(k.url.split(',')[1], 'base64');
      fs.writeFileSync(path.join(OUT, `${stem}-${String(i).padStart(2, '0')}.webp`), buf);
    });
  }
  console.log(`\nwrote ${result.reduce((a, s) => a + s.cuts.length, 0)} files -> ${path.relative(process.cwd(), OUT)}`);
}
