/**
 * Render sound effects to tools/sfx/*.wav so candidates can be compared back to back.
 *
 * Usage: npx vite --port 5174   (in another shell)
 *        node tools/render-sfx.mjs [name:file ...]
 *
 * Defaults to the checkpoint candidates. Peak level is printed for each: a candidate that
 * is several dB quieter than the others will lose a comparison on loudness alone, which is
 * not the thing being judged.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(`${process.env.SFX_URL || 'http://localhost:5174'}/tools/sfx-preview.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.ready, null, { timeout: 15000 });
fs.mkdirSync('tools/sfx', { recursive: true });
const pairs = process.argv.slice(2).length
  ? process.argv.slice(2).map((a) => a.split(':'))
  : [['checkpoint', '0-current'], ['checkpointA', 'A-rise'], ['checkpointB', 'B-bloom'], ['checkpointC', 'C-bell']];
for (const [name, file] of pairs) {
  const b64 = await page.evaluate(([n]) => window.render(n, 3), [name]);
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(`tools/sfx/${file}.wav`, buf);
  // peak level, so a candidate that is far quieter than the others is caught before it is judged
  let peak = 0;
  for (let i = 44; i + 1 < buf.length; i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)));
  console.log(`${file}.wav  ${(buf.length/1024).toFixed(0)}KB  peak ${(20*Math.log10(peak/32767)).toFixed(1)} dBFS`);
}
await browser.close();
