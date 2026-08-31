import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config/tuning.js';
import { BootScene } from './scenes/BootScene.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { HudScene } from './scenes/HudScene.js';
import { WinScene } from './scenes/WinScene.js';
import { installAutoPause, trackVisualViewport } from './systems/lifecycle.js';
import { installFullscreenToggle } from './systems/fullscreen.js';
import { audio } from './systems/audio.js';
import { music } from './systems/music.js';
import { SPRITE_SIZES } from './gfx/textures.js';

// ?debug=1 draws Arcade bodies — useful when tuning hitboxes on a device.
const debugPhysics = new URLSearchParams(location.search).has('debug');

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.void,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    expandParent: true,
    // Left unset, Phaser builds its own wrapper div on the first full-screen request and
    // *reparents the canvas into it* — which would move the canvas out from under
    // `expandParent` and out of the element `trackVisualViewport` measures and sizes.
    // Naming the existing container keeps the DOM exactly as it is.
    fullscreenTarget: 'game'
  },
  input: {
    activePointers: 3,
    touch: { capture: true }
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // the player runs its own asymmetric gravity
      fixedStep: true, // identical simulation on 60Hz and 120Hz screens
      fps: 60,
      // Arcade cancels a tile separation when the overlap exceeds tileBias (default 16px),
      // which is how fast bodies fall through solid ground. Terminal velocity here is
      // MAX_FALL_SPEED / 60 ≈ 19px per step, so the bias has to comfortably exceed that.
      tileBias: 40,
      debug: debugPhysics
    }
  },
  render: {
    antialias: true,
    roundPixels: true,
    powerPreference: 'high-performance'
  },
  fps: { target: 60, min: 30, smoothStep: true },
  autoFocus: true,
  scene: [BootScene, PreloadScene, MenuScene, GameScene, HudScene, WinScene]
});

// Keep the canvas sized to the visible viewport, not the layout one.
const refitViewport = trackVisualViewport(game);

// Full-screen toggle: the only way to reclaim the browser toolbar's strip of screen, since
// this page disables the scrolling that would normally collapse it.
installFullscreenToggle(game, refitViewport);

// Auto-pause on backgrounding: the HUD listens for this and puts up the pause menu, so
// the player never comes back to a run already in progress.
installAutoPause({
  onBackground: () => {
    game.events.emit('app:background');
    audio.suspend();
  },
  onForeground: () => {
    game.events.emit('app:foreground');
    const gameScene = game.scene.getScene('Game');
    if (!gameScene || !gameScene.scene.isPaused()) audio.resume();
  }
});

export default game;

// Exposed for the headless smoke test / debugging in devtools.
window.__game = game;
window.__spriteSizes = SPRITE_SIZES;
// Audio has no visual output to inspect, so these are the only way to check from outside
// that the graph is actually producing signal rather than silently doing nothing.
window.__audio = audio;
window.__music = music;
