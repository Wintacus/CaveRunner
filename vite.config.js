import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built bundle works from file:// inside the Capacitor WebView.
  base: './',
  server: {
    host: true, // expose on the LAN so a real phone can hit the dev server
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
});
