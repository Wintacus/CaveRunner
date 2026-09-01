import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';
import { audio } from '../systems/audio.js';
import { Parallax } from '../systems/parallax.js';
import { getSafeArea } from '../systems/lifecycle.js';

/** Start screen. The tap that begins the run is also the gesture that unlocks audio. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.parallax = new Parallax(this);
    this.drift = 0;

    // Same scrim as the win screen, for the same reason: text over the cave parallax has to
    // fight a bright cyan background, and the two title cards should read as one treatment.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.66).setOrigin(0, 0);

    const cx = GAME_WIDTH / 2;
    const safe = getSafeArea(this.game);

    this.add
      .text(cx, GAME_HEIGHT * 0.33, 'CAVE', {
        fontFamily: 'sans-serif',
        fontSize: '78px',
        fontStyle: 'bold',
        color: '#cfe9ff',
        padding: { x: 26, y: 20 }
      })
      .setOrigin(0.5)
      .setShadow(0, 0, '#3fe0c8', 12, false, true);

    this.add
      .text(cx, GAME_HEIGHT * 0.33 + 62, 'RUNNER', {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        fontStyle: 'bold',
        color: '#f4fbff',
        stroke: '#071018',
        strokeThickness: 10,
        letterSpacing: 12,
        padding: { x: 26, y: 20 }
      })
      .setOrigin(0.5)
      .setShadow(0, 4, '#000000', 10, true, true);

    // A crystal and the runner, idling on the title card.
    this.add.image(cx - 168, GAME_HEIGHT * 0.36, KEYS.crystal).setScale(1.3);
    const runner = this.add.image(cx + 172, GAME_HEIGHT * 0.36, KEYS.player).setScale(1.3);
    this.tweens.add({ targets: runner, y: '-=14', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const prompt = this.add
      .text(cx, GAME_HEIGHT * 0.74, 'TAP ANYWHERE TO BEGIN', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#8fb6cf'
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add
      .text(cx, GAME_HEIGHT * 0.86, 'Tap to jump  ·  hold to jump higher', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#a8c4d8'
      })
      .setOrigin(0.5);

    /**
     * Which build this is. Deliberately dim and out of the way — it is a diagnostic, not
     * part of the title card — but legible enough to read off a phone without zooming.
     * Bottom LEFT because the fullscreen button lives bottom right.
     */
    this.add
      .text(12, GAME_HEIGHT - safe.bottom - 10, __BUILD_ID__, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#6f8da0'
      })
      .setOrigin(0, 1)
      .setAlpha(0.75);

    this.add.rectangle(0, GAME_HEIGHT - 2, GAME_WIDTH, 2, COLORS.teal, 0.35).setOrigin(0, 0);

    const start = () => {
      // First guaranteed user gesture: resume the audio context and push a sound through
      // it. Doing it anywhere later risks a silent run on iOS.
      audio.unlock();
      audio.play('checkpoint', { volume: 0.6 });
      this.cameras.main.fadeOut(220, 5, 7, 13);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game'));
    };

    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown-SPACE', start);
    this.input.keyboard?.once('keydown-ENTER', start);
  }

  update(_time, delta) {
    // Slow drift so the title screen breathes.
    this.drift += delta * 0.02;
    this.parallax.update({ scrollX: this.drift, scrollY: 0 });
  }
}
