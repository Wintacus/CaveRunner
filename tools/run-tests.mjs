/**
 * Test runner: starts a preview server, runs the smoke test and the full-level autoplay
 * against it, and shuts everything down.
 *
 * Assumes `dist/` is already built (npm test does that first).
 * Usage: node tools/run-tests.mjs
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 4173;
const URL = `http://localhost:${PORT}`;

const run = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => resolve(code ?? 1));
  });

const waitForPort = async (port, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.on('connect', () => (socket.end(), resolve(true)));
      socket.on('error', () => resolve(false));
    });
    if (up) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

console.log('\n=== level validation ===');
const validate = await run(process.execPath, ['tools/validate-level.mjs']);
if (validate !== 0) process.exit(validate);

console.log(`\n=== starting preview server on ${PORT} ===`);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { stdio: 'ignore' });
const ready = await waitForPort(PORT);
if (!ready) {
  server.kill();
  console.error('preview server never came up');
  process.exit(1);
}

let failures = 0;
console.log('\n=== smoke test ===');
failures += (await run(process.execPath, ['tools/smoke-test.mjs', '--url', URL, '--seconds', '8'])) === 0 ? 0 : 1;

console.log('\n=== full-level autoplay ===');
failures += (await run(process.execPath, ['tools/autoplay.mjs', '--url', URL])) === 0 ? 0 : 1;

server.kill();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
