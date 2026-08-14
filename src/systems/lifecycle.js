/**
 * Platform glue: browser gesture locking, landscape safe-area insets, and auto-pause
 * when the app is backgrounded.
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/tuning.js';

/**
 * Stop the browser's own gestures from firing mid-run. Players tap and hold rapidly,
 * often near the top of the screen, which is exactly where pull-to-refresh and
 * swipe-to-exit-fullscreen live.
 */
export function lockGestures() {
  const stop = (e) => e.preventDefault();

  // Pull-to-refresh, rubber-band scrolling, two-finger pan.
  document.addEventListener('touchmove', stop, { passive: false });
  // Long-press context menu / callout.
  document.addEventListener('contextmenu', stop);
  // iOS pinch-zoom gestures.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, stop));
  // Desktop pinch-zoom via trackpad/ctrl+wheel.
  document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });

  // Double-tap-to-zoom: swallow the second tap of a fast pair.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd < 320) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // Best-effort landscape lock (works in installed/native contexts; a no-op elsewhere,
  // where the CSS "rotate your device" notice takes over).
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {});
  }
}

/**
 * Safe-area insets in *game* units.
 *
 * In landscape the notch/Dynamic Island sits on the left or right edge, so the left/right
 * insets are the ones that matter for the pause button and score. A minimum buffer is
 * always applied because some devices have touch dead zones near landscape edges that the
 * safe-area API doesn't report at all.
 */
const MIN_BUFFER = 20;

export function getSafeArea(game) {
  const probe = document.getElementById('safe-area-probe');
  const css = probe ? getComputedStyle(probe) : null;
  const read = (prop) => (css ? parseFloat(css.getPropertyValue(prop)) || 0 : 0);

  // CSS pixels -> game units (the canvas is letterboxed by Phaser's FIT scale mode).
  const canvas = game.canvas;
  const sx = canvas && canvas.clientWidth ? GAME_WIDTH / canvas.clientWidth : 1;
  const sy = canvas && canvas.clientHeight ? GAME_HEIGHT / canvas.clientHeight : 1;

  return {
    top: Math.max(read('padding-top') * sy, MIN_BUFFER),
    right: Math.max(read('padding-right') * sx, MIN_BUFFER),
    bottom: Math.max(read('padding-bottom') * sy, MIN_BUFFER),
    left: Math.max(read('padding-left') * sx, MIN_BUFFER)
  };
}

/**
 * Pause the game loop and audio the moment the app leaves the foreground (incoming call,
 * app switch, screen lock) and resume cleanly when it comes back.
 */
export function installAutoPause({ onBackground, onForeground }) {
  let backgrounded = false;

  const toBackground = () => {
    if (backgrounded) return;
    backgrounded = true;
    onBackground();
  };
  const toForeground = () => {
    if (!backgrounded) return;
    backgrounded = false;
    onForeground();
  };

  if (Capacitor.isNativePlatform()) {
    App.addListener('appStateChange', ({ isActive }) => (isActive ? toForeground() : toBackground()));
    App.addListener('pause', toBackground);
    App.addListener('resume', toForeground);
  }

  // Web/WebView belt-and-braces: covers tab switches and browser backgrounding.
  document.addEventListener('visibilitychange', () => (document.hidden ? toBackground() : toForeground()));
  window.addEventListener('blur', toBackground);
  window.addEventListener('focus', toForeground);
  window.addEventListener('pagehide', toBackground);
}
