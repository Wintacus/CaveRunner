import Phaser from 'phaser';
import { audio } from '../systems/audio.js';
import { lockGestures } from '../systems/lifecycle.js';

/** Boot: platform setup only. No assets, no gameplay. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    lockGestures();

    // Build the audio graph now, but play nothing — mobile browsers block playback until
    // a user gesture, which the Start screen's tap provides.
    audio.init();

    document.getElementById('boot-fallback')?.remove();

    this.scene.start('Preload');
  }
}
