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
 * Keep the canvas filling the space that is actually visible.
 *
 * Two things conspire on a phone browser. `#game` is `position: fixed; inset: 0`, and on
 * iOS a fixed element sizes to the *layout* viewport, which stays full height whether or
 * not the browser chrome is on screen — so Phaser fits the canvas into an area partly
 * hidden behind that chrome and centres what is left, drawing the game smaller than the
 * room available. And Phaser's ScaleManager only listens to `resize` and
 * `orientationchange`; iOS reports the chrome collapsing on `visualViewport` instead, which
 * Phaser never hears, so whatever size the canvas took at load survives until something
 * else happens to trigger a re-fit.
 *
 * Driving the container's height from `visualViewport` and refreshing the scale manager
 * when it changes fixes both. Scale mode stays FIT: the design space is still 960x540, so
 * every distance tuned against it — the look-ahead above all — is untouched.
 */
export function trackVisualViewport(game) {
  const el = document.getElementById('game');
  const vv = window.visualViewport;
  if (!el) return;

  let queued = false;
  const apply = () => {
    queued = false;
    // `100dvh` covers most browsers, but in-app WebViews report it inconsistently, so the
    // real measurement wins where it is available.
    if (vv) el.style.height = `${Math.round(vv.height)}px`;
    // `refresh()` re-runs the fit maths but does *not* re-measure the parent element;
    // `getParentBounds()` is what samples it. Without this the new size is only picked up
    // by Phaser's own poll, which runs every `resizeInterval` (500ms) — long enough to see
    // the canvas visibly settle a beat after the browser chrome moves.
    game.scale.getParentBounds();
    game.scale.refresh();
  };
  // Chrome collapse fires a burst of events; one re-fit per frame is plenty.
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  };

  if (vv) {
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
  }
  // The inline height above *overrides* the stylesheet, so it has to be refreshed on every
  // signal that the viewport moved — not just the visualViewport ones. Miss one and the
  // container stays pinned at a stale size, which is worse than never having measured.
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 120));
  apply();
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
