import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';
import { getSafeArea } from '../systems/lifecycle.js';
import { audio } from '../systems/audio.js';

const BTN = 56;

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
    this.pauseBtn.setSize(BTN, BTN);
    this.pauseBtn.setInteractive(new Phaser.Geom.Rectangle(-BTN / 2, -BTN / 2, BTN, BTN), Phaser.Geom.Rectangle.Contains);
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
    this.restartBtn = this.#menuButton(GAME_WIDTH / 2, GAME_HEIGHT * 0.55 + 74, 'RESTART LEVEL', () =>
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
    container.setSize(w, h);
    container.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
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
    this.#publishUiRects();
  }

  /** Let the Game scene know where the UI is, so those taps don't also fire a jump. */
  #publishUiRects() {
    const b = this.pauseBtn;
    // A little larger than the button itself: a fingertip that grazes the edge of the
    // pause button should not be read as a jump.
    const pad = 10;
    this.registry.set('uiRects', [
      { x: b.x - BTN / 2 - pad, y: b.y - BTN / 2 - pad, width: BTN + pad * 2, height: BTN + pad * 2 }
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
