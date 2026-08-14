import { defineConfig } from 'vite';

export default defineConfig({
  // Default to a relative base so the built bundle works from file:// inside the Capacitor
  // WebView. GitHub Pages serves the game from /<repo>/, so the Pages workflow sets
  // DEPLOY_BASE to that sub-path instead.
  base: process.env.DEPLOY_BASE || './',
  server: {
    host: true, // expose on the LAN so a real phone can hit the dev server
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
});
