/**
 * The full-screen toggle.
 *
 * Why a game needs one at all: this page deliberately kills scrolling — `overflow: hidden`
 * on `html`/`body`, `touch-action: none`, and a `touchmove` preventDefault in
 * `lockGestures()` — because pull-to-refresh firing mid-run is worse than any amount of
 * letterboxing. The side effect is that Safari's toolbar never collapses, since collapsing
 * it is a *scroll* response. Every other site on the phone claws that strip of screen back
 * after a swipe; this one structurally cannot. On a 852x393 landscape phone the toolbar
 * costs roughly 50px of a 393px-tall viewport, and because the canvas is height-constrained
 * in FIT mode that is a straight ~15% off the scale of everything drawn.
 *
 * The button is always offered, and that is the whole design rule here, learned the hard
 * way. The first version hid itself in two situations — when the browser reported no
 * Fullscreen API, and during a run — and both were exactly when someone would go looking
 * for it. A control that vanishes when you reach for it reads as a broken build, not as a
 * considered fallback. So the button is always on screen; what it *does* depends on what
 * the browser can actually do:
 *
 *   - Fullscreen API present  -> toggles full screen.
 *   - absent, or the request is refused -> shows how to get there via Add to Home Screen,
 *     which reaches the same place through the manifest (`display: fullscreen`,
 *     `orientation: landscape`). This is the iPhone Safari case; element full screen was
 *     unsupported there for years and only shipped in Safari 17.2/17.4, so whether it works
 *     depends on the phone in the player's hand rather than on anything knowable here.
 *
 * The one case where it is hidden is when there is no browser chrome left to reclaim —
 * launched from the home screen, the button would be offering something already true.
 */
import Phaser from 'phaser';

/** Remembers a dismissed hint, so it is *offered* once and never nags. */
const HINT_KEY = 'caverunner.a2hs-hint-dismissed';

/** Already running without browser chrome — installed to the home screen. */
const isChromeless = () =>
  window.navigator.standalone === true ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.matchMedia('(display-mode: standalone)').matches;

/** iPadOS reports itself as MacIntel, hence the touch-point check. */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const stored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Safari private mode throws on localStorage access.
  }
};

const store = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* nothing to do — the hint just reappears next session */
  }
};

/**
 * Reported by the `?perf=1` readout. The player has no devtools, so the only way to learn
 * what their phone actually supports is to have the game say so on screen.
 */
export const fullscreenState = {
  available: false,
  active: false,
  standalone: false,
  reason: 'booting'
};

/**
 * @param {Phaser.Game} game
 * @param {() => void} refit - re-runs the viewport measurement (from `trackVisualViewport`)
 */
export function installFullscreenToggle(game, refit = () => {}) {
  const btn = document.getElementById('fullscreen-btn');
  const hint = document.getElementById('a2hs-hint');
  const hintDismiss = document.getElementById('a2hs-dismiss');
  if (!btn) return;

  // Phaser's input listens on `window` as well as on the canvas, so a tap on a DOM control
  // sitting above the canvas still reaches the game and reads as a jump. Stopping the event
  // at the button keeps it away from that window listener — and, unlike preventDefault, it
  // leaves the `click` that follows intact. The same guard keeps taps away from the
  // double-tap-zoom swallower in `lockGestures`, which would otherwise cancel the click.
  const swallow = (e) => e.stopPropagation();
  ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach((ev) => {
    btn.addEventListener(ev, swallow);
    hint?.addEventListener(ev, swallow);
  });

  let canFullscreen = false; // the API is there and has not refused
  let offerButton = false; // there is browser chrome worth reclaiming
  let inPlay = false;

  const sync = () => {
    const active = game.scale.isFullscreen;
    btn.classList.toggle('is-fullscreen', active);
    // Dimmed rather than hidden during a run: still reachable, no longer competing with
    // the game for attention.
    btn.classList.toggle('is-playing', inPlay);
    btn.setAttribute(
      'aria-label',
      active ? 'Exit full screen' : canFullscreen ? 'Enter full screen' : 'How to play full screen'
    );
    btn.hidden = !offerButton;

    fullscreenState.available = canFullscreen;
    fullscreenState.active = active;
    fullscreenState.standalone = isChromeless();
  };

  /** @param {boolean} auto - true when offered unprompted, which the player can silence */
  const showHint = (auto) => {
    if (!hint || (auto && stored(HINT_KEY))) return;
    hint.hidden = false;
  };

  hintDismiss?.addEventListener('click', () => {
    hint.hidden = true;
    store(HINT_KEY, '1');
  });

  btn.addEventListener('click', () => {
    if (!canFullscreen) {
      // No API, or it refused earlier. Explain the route that does work — and let the
      // button close the explanation again, so it is a toggle either way.
      if (hint) hint.hidden = !hint.hidden;
      return;
    }
    if (game.scale.isFullscreen) game.scale.stopFullscreen();
    else game.scale.startFullscreen();
  });

  game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
    // Full screen is the one context where a landscape lock is actually granted on Android;
    // the attempt at boot is always refused. Still a no-op on iOS, which has no lock API.
    if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
    if (hint) hint.hidden = true;
    sync();
    refit();
  });

  game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, () => {
    sync();
    refit();
  });

  // The request can be refused after the browser advertised support. Stop offering a toggle
  // that does not toggle, but keep the button — it now explains the route that works.
  const failed = () => {
    canFullscreen = false;
    fullscreenState.reason = 'request refused';
    sync();
    showHint(false);
  };
  game.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, failed);
  game.scale.on(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, failed);

  // `scale.fullscreen` is populated from `game.device` during boot, and the scenes are not
  // registered until the scene manager drains its queue on the same event — so everything
  // that inspects either has to wait for `ready`.
  game.events.once(Phaser.Core.Events.READY, () => {
    canFullscreen = game.scale.fullscreen.available;
    offerButton = !isChromeless();
    fullscreenState.reason = !offerButton
      ? 'already chromeless'
      : canFullscreen
        ? 'api available'
        : 'no element fullscreen api';
    sync();

    // Offered unprompted only where it is the *only* route to a chrome-free game.
    if (offerButton && !canFullscreen && isIOS()) showHint(true);

    const scene = game.scene.getScene('Game');
    if (!scene) return;
    const E = Phaser.Scenes.Events;
    const playing = (yes) => () => {
      inPlay = yes;
      sync();
    };
    [E.START, E.RESUME, E.WAKE].forEach((ev) => scene.events.on(ev, playing(true)));
    [E.PAUSE, E.SLEEP, E.SHUTDOWN].forEach((ev) => scene.events.on(ev, playing(false)));
  });
}
