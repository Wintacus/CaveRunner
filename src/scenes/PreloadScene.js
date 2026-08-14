import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { generateTextures } from '../gfx/textures.js';

/** Preload: loading bar, level + tileset load, and generation of the procedural art. */
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

    this.load.image('cave_tiles', 'assets/tilesets/cave_tiles.png');
    this.load.tilemapTiledJSON('level1', 'assets/levels/level1.tmj');
  }

  create() {
    // ART SWAP POINT: replace this with atlas loads once generated sprite sheets exist.
    generateTextures(this, GAME_HEIGHT);
    this.scene.start('Menu');
  }
}
