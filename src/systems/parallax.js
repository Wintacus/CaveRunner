import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';

/**
 * Three depth layers of cave, scrolled at different rates against the camera to fake
 * distance, plus a drift of glowing spores for atmosphere.
 *
 * The layers are screen-fixed tile sprites (scrollFactor 0) whose tilePosition is driven
 * manually — that gives exact control over each layer's rate and keeps a 850-tile level
 * from needing 850 tiles of background art.
 */
export class Parallax {
  constructor(scene) {
    const layer = (key, depth, factor) => ({
      sprite: scene.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth),
      factor
    });

    this.layers = [
      layer(KEYS.bgFar, -40, 0.1), // distant cave wall
      layer(KEYS.bgMid, -30, 0.32), // mid-ground rock formations
      layer(KEYS.bgNear, 26, 0.66) // foreground rock framing the top and bottom
    ];

    // Ambient spores. Screen-space, so they cost nothing to keep alive for the whole level.
    this.spores = scene.add
      .particles(0, 0, KEYS.glow, {
        x: { min: -40, max: GAME_WIDTH + 40 },
        y: { min: 0, max: GAME_HEIGHT },
        lifespan: { min: 4000, max: 9000 },
        speedX: { min: -26, max: -10 },
        speedY: { min: -8, max: 8 },
        scale: { min: 0.05, max: 0.16 },
        alpha: { start: 0.45, end: 0 },
        frequency: 220,
        quantity: 1,
        tint: [COLORS.teal, COLORS.violet, COLORS.ice],
        blendMode: Phaser.BlendModes.ADD
      })
      .setScrollFactor(0)
      .setDepth(-10);
  }

  update(camera) {
    for (const { sprite, factor } of this.layers) {
      sprite.tilePositionX = camera.scrollX * factor;
      sprite.tilePositionY = camera.scrollY * factor * 0.4;
    }
  }
}
