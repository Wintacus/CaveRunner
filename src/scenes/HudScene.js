import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';
import { getSafeArea } from '../systems/lifecycle.js';
import { audio } from '../systems/audio.js';
import { support as hapticSupport, lastEvent as lastHaptic } from '../systems/haptics.js';
import { fullscreenState } from '../systems/fullscreen.js';
import { music } from '../systems/music.js';

const BTN = 56;

/**
 * Touch targets are sized separately from the art, and larger than it.
 *
 * These buttons used to respond only across the top-left quarter of what they draw, which
 * is what "hit or miss" meant when it was reported. The hit rectangles were written as
 * `(-w/2, -h/2, w, h)` — centred, the way the child graphics are — but a Game Object's hit
 * area is in *local* space measured from its top-left corner: Phaser's own default is
 * `Rectangle(0, 0, width, height)`. Writing it centred therefore displaced the whole area
 * half a button up and to the left, so only the overlap with the artwork responded. Taps on
 * the lower-right of the button hit nothing, and taps on empty space above and to the left
 * of it worked. Hence: set the size, and let Phaser build the rectangle. Nothing here
 * should hand-write one again.
 *
 * Size is the second half of it. The design space is 960x540 and FIT scales it down to
 * whatever the phone gives us, so a button drawn at 56 units is not 56 pixels in the hand —
 * on a 852x393 landscape phone it is 41px installed to the home screen and 36px in Safari,
 * where the toolbar eats the height. Apple's minimum is 44pt and both were under it.
 * Drawing them bigger would cost screen the game needs, so only the target grows: 88 units
 * is ~64px installed and ~56px in Safari.
 */
const BTN_HIT = 88;

/**
 * The pause menu's two buttons, which are a different problem: they sit one above the
 * other, so their hit areas cannot both grow without meeting in the middle — and the lower
 * one restarts the level, which is not something to hand to an ambiguous tap. The gap
 * between them opens up to make room, and the hit height stays 4 units short of it so
 * there is always a dead band rather than an overlap.
 */
const MENU_GAP = 88;
const MENU_HIT_H = MENU_GAP - 4;

/**
 * Overlay scene: score, shield state, pause button, toasts and the pause menu.
 *
 * It runs in parallel with (and on top of) the Game scene, so pausing the game leaves the
 * UI alive and interactive.
 *
 * Everything is positioned from the CSS safe-area insets, with a hard minimum buffer from
 * every edge — in landscape the notch is on the *side*, and some devices additionally have
 * unreported touch dead zones along the edges.
 */
export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    this.game_ = this.scene.get('Game');
    this.safe = getSafeArea(this.game);

    this.#buildScore();
    this.#buildPauseButton();
    this.#buildToast();
    this.#buildPauseMenu();
    this.#buildDebugReadout();

    this.registry.events.on('changedata-score', (_p, value) => this.scoreText.setText(String(value)));
    this.registry.events.on('changedata-shield', (_p, value) => this.#setShield(value));
    this.game_.events.on('toast', this.showToast, this);

    // Auto-pause when the app is backgrounded (call, app switch, screen lock).
    this.game.events.on('app:background', this.forcePause, this);

    this.scale.on('resize', this.#layout, this);
    this.events.once('shutdown', () => {
      this.registry.events.off('changedata-score');
      this.registry.events.off('changedata-shield');
      this.game_.events.off('toast', this.showToast, this);
      this.game.events.off('app:background', this.forcePause, this);
      this.scale.off('resize', this.#layout, this);
    });

    this.#layout();
  }

  #buildScore() {
    this.scoreIcon = this.add.image(0, 0, KEYS.crystal).setScale(0.8).setOrigin(0, 0.5);
    this.scoreText = this.add
      .text(0, 0, '0', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#cfe9ff',
        padding: { x: 16, y: 12 }
      })
      .setOrigin(0, 0.5)
      .setShadow(0, 0, '#3fe0c8', 12, false, true);

    this.shieldIcon = this.add.image(0, 0, KEYS.mushroom).setScale(0.7).setOrigin(0, 0.5).setAlpha(0.18);
    this.shieldPulse = null;
  }

  /**
   * ?debug=1 only: a device readout. Phone-only testing has no devtools, so "I feel no
   * haptics" is otherwise impossible to tell apart from "this device has no vibration
   * API" (which is every iPhone on the web).
   */
  #buildDebugReadout() {
    const params = new URLSearchParams(location.search);
    // ?debug=1 draws the Arcade bodies too, and those outlines are themselves a rendering
    // cost — enough to distort the numbers below. ?perf=1 is the honest measurement: the
    // readout, with the game rendering exactly what it normally renders.
    if (!params.has('debug') && !params.has('perf')) return;

    if (params.has('debug')) {
      this.debugText = this.add
        .text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#8fb6cf' })
        .setOrigin(0, 1)
        .setDepth(60);
    }

    // Performance readout. Large on purpose: it is read on a phone, at arm's length,
    // while the game is running, by someone who has no devtools to fall back on.
    this.perfText = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#7dffb0',
        backgroundColor: '#000000cc',
        padding: { x: 8, y: 6 }
      })
      .setOrigin(0, 0)
      .setDepth(61);

    this.perf = { frames: [], worst: 0, clamped: 0, since: 0 };

    /**
     * Where a tap actually landed, in game coordinates, drawn where it landed.
     *
     * This answers the one question that cannot be answered by reading the code: when a
     * button does not respond, is the touch arriving somewhere other than under the finger,
     * or is it arriving in the right place and simply missing a target that is too small?
     * The outline shows the pause button's real hit area and the dot shows the tap. Finger
     * on the dot means the transform is honest and size is the whole story; dot adrift of
     * the finger means the pointer transform is stale, which is a different bug entirely.
     */
    this.hitOutline = this.add.graphics().setDepth(62);
    this.tapDot = this.add.circle(0, 0, 9, 0xff4d6d, 0.95).setDepth(63).setVisible(false);
    this.tapRing = this.add.circle(0, 0, 24).setStrokeStyle(2, 0xff4d6d, 0.9).setDepth(63).setVisible(false);
    this.lastTap = null;

    this.input.on('pointerdown', (p) => {
      this.lastTap = { x: Math.round(p.x), y: Math.round(p.y) };
      this.tapDot.setPosition(p.x, p.y).setVisible(true);
      this.tapRing.setPosition(p.x, p.y).setVisible(true);
    });
  }

  /** Debug only: outline the pause button's hit area, so it can be compared to a tap. */
  #drawHitOutline() {
    if (!this.hitOutline) return;
    const b = this.pauseBtn;
    this.hitOutline.clear();
    this.hitOutline.lineStyle(2, 0xff4d6d, 0.8);
    this.hitOutline.strokeRect(b.x - BTN_HIT / 2, b.y - BTN_HIT / 2, BTN_HIT, BTN_HIT);
  }

  #buildPauseButton() {
    this.pauseBtn = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.stoneDark, 0.72);
    bg.fillRoundedRect(-BTN / 2, -BTN / 2, BTN, BTN, 14);
    bg.lineStyle(2, COLORS.teal, 0.55);
    bg.strokeRoundedRect(-BTN / 2, -BTN / 2, BTN, BTN, 14);
    const barL = this.add.rectangle(-7, 0, 6, 22, COLORS.ice, 0.92);
    const barR = this.add.rectangle(7, 0, 6, 22, COLORS.ice, 0.92);
    this.pauseBtn.add([bg, barL, barR]);
    // Size then setInteractive(): Phaser derives a correctly aligned hit area from the
    // size. The container's own size is the *target*, not the artwork, which is drawn at
    // BTN by the children above.
    this.pauseBtn.setSize(BTN_HIT, BTN_HIT);
    this.pauseBtn.setInteractive();
    this.pauseBtn.on('pointerdown', () => this.togglePause());
  }

  #buildToast() {
    this.toast = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.22, '', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#3fe0c8'
      })
      .setOrigin(0.5)
      .setAlpha(0);
  }

  #buildPauseMenu() {
    this.menu = this.add.container(0, 0).setVisible(false).setDepth(50);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.82).setOrigin(0, 0);
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, 'PAUSED', {
        fontFamily: 'sans-serif',
        fontSize: '46px',
        fontStyle: 'bold',
        color: '#cfe9ff'
      })
      .setOrigin(0.5);

    this.resumeBtn = this.#menuButton(GAME_WIDTH / 2, GAME_HEIGHT * 0.55, 'RESUME', () => this.togglePause());
    this.restartBtn = this.#menuButton(GAME_WIDTH / 2, GAME_HEIGHT * 0.55 + MENU_GAP, 'RESTART LEVEL', () =>
      this.#restart()
    );

    this.menu.add([dim, title, this.resumeBtn, this.restartBtn]);
  }

  #menuButton(x, y, label, onClick) {
    const w = 300;
    const h = 56;
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.stoneMid, 0.9);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(2, COLORS.teal, 0.6);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    const text = this.add
      .text(0, 0, label, { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#cfe9ff' })
      .setOrigin(0.5);
    container.add([bg, text]);
    // Taller than it draws, and derived from the size rather than hand-written, for the
    // same two reasons as the pause button — see BTN_HIT.
    container.setSize(w, MENU_HIT_H);
    container.setInteractive();
    container.on('pointerdown', onClick);
    return container;
  }

  #layout() {
    this.safe = getSafeArea(this.game);
    const { top, left, right } = this.safe;

    this.scoreIcon.setPosition(left, top + 16);
    this.scoreText.setPosition(left + 26, top + 16);
    this.shieldIcon.setPosition(left + 2, top + 54);

    this.pauseBtn.setPosition(GAME_WIDTH - right - BTN / 2, top + BTN / 2);
    if (this.debugText) this.debugText.setPosition(left, GAME_HEIGHT - this.safe.bottom);
    // Below the score and shield icons, clear of the pause button on the right.
    if (this.perfText) this.perfText.setPosition(left, top + 78);
    this.#drawHitOutline();
    this.#publishUiRects();
  }

  /** Let the Game scene know where the UI is, so those taps don't also fire a jump. */
  #publishUiRects() {
    const b = this.pauseBtn;
    // Exactly the button's hit area. These two must agree: a tap the pause button accepts
    // but this rect misses would pause the game *and* spend a jump on the way.
    this.registry.set('uiRects', [
      { x: b.x - BTN_HIT / 2, y: b.y - BTN_HIT / 2, width: BTN_HIT, height: BTN_HIT }
    ]);
  }

  #setShield(active) {
    this.shieldIcon.setAlpha(active ? 1 : 0.18);
    if (this.shieldPulse) {
      this.shieldPulse.stop();
      this.shieldPulse = null;
    }
    this.shieldIcon.setScale(0.7);
    if (active) {
      this.shieldPulse = this.tweens.add({
        targets: this.shieldIcon,
        scale: 0.82,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  update() {
    if (this.perfText) this.#updatePerf();
    if (!this.debugText) return;
    this.debugText.setText(
      `haptics: ${hapticSupport.describe()}  |  last: ${lastHaptic.name} ` +
        `${lastHaptic.delivered ? 'sent' : 'not sent'}\n` +
        `native=${hapticSupport.native}  vibrate()=${hapticSupport.vibrationApi}`
    );
  }

  /**
   * ?debug=1 only: what the device is actually doing.
   *
   * The line that matters most is `sim`. Phaser is configured with `fps.min`, which clamps
   * the delta handed to the simulation; once the real frame time passes that clamp the game
   * stops advancing real time and runs in *slow motion* rather than merely dropping frames.
   * A phone at 24fps with everything moving at three-quarter speed and a phone at 55fps
   * with a rendering glitch look similarly bad to the eye and need opposite fixes, so this
   * prints both the raw frame time and the simulated one, and says outright when they have
   * diverged.
   */
  #updatePerf() {
    const loop = this.game.loop;
    const p = this.perf;

    p.frames.push(loop.rawDelta);
    if (p.frames.length > 60) p.frames.shift();
    p.worst = Math.max(p.worst, loop.rawDelta);
    if (loop.rawDelta > loop.delta + 1) p.clamped++;

    // Refresh the text a few times a second, not every frame: building a string and
    // re-rasterising a Text object is itself work, and this must not distort what it measures.
    p.since += loop.rawDelta;
    if (p.since < 250) return;
    p.since = 0;

    const sorted = [...p.frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const fps = Math.round(loop.actualFps);
    const slowMo = loop.rawDelta > loop.delta + 1;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'CANVAS(!)';
    const game = this.scene.get('Game');
    const objects = game?.children?.list?.length ?? 0;
    const active = game?.director
      ? [...game.director.pools.values()].reduce((n, pool) => n + pool.active.length, 0)
      : 0;

    // Whether this device can do full screen is not knowable from a build machine — it is
    // a property of the phone in the player's hand. Reporting it here is the only way to
    // find out without devtools, which is how the last round of this got diagnosed.
    const fs = fullscreenState;

    // Touch diagnostics. `tap` is where the last touch landed in game coordinates and
    // `pause` is where the pause button's hit area is; if a tap on the button reads OUT,
    // compare the two numbers to see which way it is off. `canvas` is the on-screen size
    // of the 960x540 design space — the scale factor that decides whether a 56-unit button
    // clears Apple's 44px minimum.
    const t = this.lastTap;
    const b = this.pauseBtn;
    const inBtn =
      t && Math.abs(t.x - b.x) <= BTN_HIT / 2 && Math.abs(t.y - b.y) <= BTN_HIT / 2;
    const r = this.game.canvas.getBoundingClientRect();
    const px = (r.width / GAME_WIDTH) * BTN;

    this.perfText.setColor(fps >= 50 ? '#7dffb0' : fps >= 30 ? '#ffd479' : '#ff8080');
    this.perfText.setText(
      `fps ${fps}   frame ${median.toFixed(1)}ms   worst ${p.worst.toFixed(0)}ms\n` +
        `raw ${loop.rawDelta.toFixed(1)}ms  sim ${loop.delta.toFixed(1)}ms` +
        `${slowMo ? '  << SLOW-MO' : ''}\n` +
        `${renderer}  objects ${objects}  creatures ${active}  clamped ${p.clamped}\n` +
        `fs ${fs.available ? 'yes' : 'NO'}` +
        `${fs.active ? ' (on)' : ''}${fs.standalone ? ' installed' : ''}  ${fs.reason}\n` +
        `tap ${t ? `${t.x},${t.y}` : '-'}  pause ${Math.round(b.x)},${Math.round(b.y)}` +
        `  ${t ? (inBtn ? 'IN' : 'OUT') : ''}\n` +
        `music ${music.playing ? music.variant.label : 'off'}\n` +
        `canvas ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}` +
        `  btn ${px.toFixed(0)}px`
    );
    p.worst = 0;
  }

  showToast(message, colour = COLORS.teal) {
    this.toast.setText(message);
    this.toast.setColor(`#${colour.toString(16).padStart(6, '0')}`);
    this.toast.setAlpha(1).setScale(0.8);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 420 });
  }

  togglePause() {
    const game = this.scene.get('Game');
    if (!game) return;
    if (game.scene.isPaused()) {
      this.menu.setVisible(false);
      this.#publishUiRects();
      game.resumeGame();
    } else {
      game.pauseGame();
      this.menu.setVisible(true);
      // While the menu is up, every tap belongs to the UI.
      this.registry.set('uiRects', [{ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT }]);
    }
  }

  /** Backgrounding always pauses; it never toggles back on. */
  forcePause() {
    const game = this.scene.get('Game');
    if (!game || game.scene.isPaused()) return;
    this.togglePause();
  }

  #restart() {
    this.menu.setVisible(false);
    audio.resume();
    const game = this.scene.get('Game');
    if (game.scene.isPaused()) game.scene.resume();
    game.restartLevel();
  }
}
