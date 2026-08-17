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
 * in FIT mode that is a straight ~15% off the scale of everything drawn. Full screen is the
 * only way to get it back inside the browser.
 *
 * The button is deliberately optimistic. Element full screen on iPhone was unsupported for
 * years — only `<video>` could do it — and shipped in Safari 17.2/17.4, so whether it works
 * depends on the phone in the player's hand rather than on anything knowable here. So:
 * offer the button when the browser claims support, and if the request then fails anyway,
 * fall back to telling iOS players about Add to Home Screen, which reaches the same place
 * via the manifest (`display: fullscreen`, `orientation: landscape`).
 */
import Phaser from 'phaser';

/** Remembers a dismissed hint, so it is offered once and never nags. */
const HINT_KEY = 'caverunner.a2hs-hint-dismissed';

/** Already running without browser chrome — installed to the home screen, or full screen. */
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
 * @param {Phaser.Game} game
 * @param {() => void} refit - re-runs the viewport measurement (from `trackVisualViewport`)
 */
export function installFullscreenToggle(game, refit = () => {}) {
  const btn = document.getElementById('fullscreen-btn');
  const hint = document.getElementById('a2hs-hint');
  const hintDismiss = document.getElementById('a2hs-dismiss');
  if (!btn) return;

  // Phaser's input listens on `window` as well as on the canvas, so a tap on a DOM button
  // sitting *above* the canvas still reaches the game and reads as a jump. Stopping the
  // event at the button keeps it away from that window listener — and, unlike
  // preventDefault, leaves the `click` that follows intact. The same guard keeps taps away
  // from the double-tap-zoom swallower in `lockGestures`, which would otherwise cancel the
  // click outright.
  const swallow = (e) => e.stopPropagation();
  ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach((ev) => {
    btn.addEventListener(ev, swallow);
    hint?.addEventListener(ev, swallow);
  });

  let available = false;
  let inPlay = false;

  const sync = () => {
    const active = game.scale.isFullscreen;
    btn.classList.toggle('is-fullscreen', active);
    btn.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
    // Hidden during a run: in landscape the button sits where a thumb rests, and trading a
    // jump for an accidental full-screen toggle is the one way this feature could cost a
    // life. The pause menu and the start screen are when anyone actually wants it.
    btn.hidden = !available || inPlay;
  };

  const showHint = () => {
    if (!hint || !isIOS() || isChromeless() || stored(HINT_KEY)) return;
    hint.hidden = false;
  };

  hintDismiss?.addEventListener('click', () => {
    hint.hidden = true;
    store(HINT_KEY, '1');
  });

  btn.addEventListener('click', () => {
    if (game.scale.isFullscreen) game.scale.stopFullscreen();
    else game.scale.startFullscreen();
  });

  game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
    // Full screen is the one context where a landscape lock is actually granted on Android;
    // the attempt at boot is always refused. Still a no-op on iOS, which has no lock API.
    if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
    sync();
    refit();
  });

  const left = () => {
    sync();
    refit();
  };
  game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, left);

  // The request can be refused after the browser advertised support — iPhone Safari is the
  // case this is here for. Retire the button rather than leave a dead control on screen,
  // and point iOS players at the route that does work.
  const failed = () => {
    available = false;
    sync();
    showHint();
  };
  game.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, failed);
  game.scale.on(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, failed);

  // `scale.fullscreen` is populated from `game.device` during boot, and the scenes are not
  // registered until the scene manager drains its queue on the same event — so everything
  // that inspects either has to wait for `ready`.
  game.events.once(Phaser.Core.Events.READY, () => {
    available = game.scale.fullscreen.available && !isChromeless();
    if (!available) showHint();
    sync();

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
