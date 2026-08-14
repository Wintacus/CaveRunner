import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';
import { Parallax } from '../systems/parallax.js';
import { getSafeArea } from '../systems/lifecycle.js';

/** Win screen. Score is per-run only — there is no save system in this build. */
export class WinScene extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  init(data) {
    this.stats = {
      score: 0,
      crystals: 0,
      totalCrystals: 0,
      deaths: 0,
      time: 0,
      ...data
    };
  }

  create() {
    this.parallax = new Parallax(this);
    this.drift = 0;
    this.cameras.main.fadeIn(320, 5, 7, 13);

    const cx = GAME_WIDTH / 2;
    const safe = getSafeArea(this.game);

    this.add
      .text(cx, GAME_HEIGHT * 0.2, 'LEVEL COMPLETE', {
        fontFamily: 'sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#cfe9ff',
        padding: { x: 26, y: 20 }
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#3fe0c8', 12, false, true);

    const secs = this.stats.time / 1000;
    const mm = Math.floor(secs / 60);
    const ss = (secs % 60).toFixed(1).padStart(4, '0');

    const rows = [
      ['CRYSTALS', `${this.stats.crystals} / ${this.stats.totalCrystals}`],
      ['SCORE', String(this.stats.score)],
      ['TIME', `${mm}:${ss}`],
      ['DEATHS', String(this.stats.deaths)]
    ];

    rows.forEach(([label, value], i) => {
      const y = GAME_HEIGHT * 0.38 + i * 34;
      this.add
        .text(cx - 150, y, label, { fontFamily: 'sans-serif', fontSize: '18px', color: '#4a6076' })
        .setOrigin(0, 0.5);
      this.add
        .text(cx + 150, y, value, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#3fe0c8'
        })
        .setOrigin(1, 0.5);
    });

    this.add.image(cx - 210, GAME_HEIGHT * 0.42, KEYS.crystal).setScale(1.2);
    this.add.image(cx + 210, GAME_HEIGHT * 0.42, KEYS.goal).setScale(0.5).setOrigin(0.5, 0.5);

    const prompt = this.add
      .text(cx, GAME_HEIGHT - safe.bottom - 46, 'TAP TO RUN IT AGAIN', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#8fb6cf'
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.rectangle(0, GAME_HEIGHT - 2, GAME_WIDTH, 2, COLORS.teal, 0.35).setOrigin(0, 0);

    // Small delay so the celebratory tap that finished the level doesn't skip this screen.
    this.time.delayedCall(600, () => {
      this.input.once('pointerdown', () => this.#again());
      this.input.keyboard?.once('keydown-SPACE', () => this.#again());
    });
  }

  #again() {
    this.cameras.main.fadeOut(220, 5, 7, 13);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game'));
  }

  update(_time, delta) {
    this.drift += delta * 0.02;
    this.parallax.update({ scrollX: this.drift, scrollY: 0 });
  }
}
