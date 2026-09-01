import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/**
 * The commit this build came from, stamped into the menu.
 *
 * Exists because the only way to test this game is to deploy it, and GitHub Pages caches
 * index.html while serving hashed assets as immutable — so a stale page loads an old bundle
 * from cache and runs perfectly, looking exactly like a deploy that did not take. That cost
 * a round trip of "I don't think your changes landed" when they had. Now the build says
 * which one it is.
 *
 * Falls back to 'dev' outside a git checkout (a tarball, or a Capacitor build from one).
 */
const BUILD_ID = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  // Default to a relative base so the built bundle works from file:// inside the Capacitor
  // WebView. GitHub Pages serves the game from /<repo>/, so the Pages workflow sets
  // DEPLOY_BASE to that sub-path instead.
  base: process.env.DEPLOY_BASE || './',
  server: {
    host: true, // expose on the LAN so a real phone can hit the dev server
    port: 5173
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
});
