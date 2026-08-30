import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { generateTextures, ART_FILES } from '../gfx/textures.js';

/** Preload: loading bar, level + tileset + file art, then stamp/generate textures. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add
      .text(cx, cy - 46, 'CAVE RUNNER', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: '#3fe0c8'
      })
      .setOrigin(0.5)
      .setAlpha(0.9);

    const barW = 300;
    const barH = 8;
    this.add.rectangle(cx, cy + 10, barW, barH, COLORS.stoneMid).setOrigin(0.5);
    const fill = this.add.rectangle(cx - barW / 2, cy + 10, 0, barH, COLORS.teal).setOrigin(0, 0.5);
    const label = this.add
      .text(cx, cy + 34, 'loading', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#4a6076'
      })
      .setOrigin(0.5);

    this.load.on('progress', (p) => {
      fill.width = barW * p;
      label.setText(`loading ${Math.round(p * 100)}%`);
    });

    // Resolve asset URLs against the deployed base rather than the current document URL:
    // on GitHub Pages the game lives at /<repo>/, and a visit without the trailing slash
    // would otherwise resolve relative paths against the domain root.
    this.load.setBaseURL(import.meta.env.BASE_URL);

    this.load.image('cave_tiles', 'assets/tilesets/cave_tiles.png');
    this.load.tilemapTiledJSON('level1', 'assets/levels/level1.tmj');
    for (const { key, path } of Object.values(ART_FILES)) this.load.image(key, path);
  }

  create() {
    // File-backed art (ART_FILES) is already loaded; this stamps it into KEYS canvases
    // and still generates the remaining procedural sprites.
    generateTextures(this, GAME_HEIGHT);
    this.scene.start('Menu');
  }
}
