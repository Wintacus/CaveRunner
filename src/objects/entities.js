import Phaser from 'phaser';
import { COLORS } from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';

/**
 * Every non-player object in the level.
 *
 * They are all pooled (see systems/director.js): construction happens once, after which
 * instances are recycled as the camera moves. Bodies are dynamic-but-unmoved
 * (`body.moves = false`, gravity off) — Arcade still syncs them from the sprite transform
 * each step, which lets each class drive its own motion while overlap tests keep working.
 *
 * Creature timing is driven by a per-instance clock that starts at `phase * period` the
 * moment the creature wakes up ahead of the camera. That makes every pattern deterministic
 * relative to the player's approach: the beat you learn on attempt 3 is the same beat you
 * get on attempt 30, including after a respawn.
 */

const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Phaser.Math.Clamp(t, 0, 1));

export class Entity extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, texture) {
    super(scene, 0, 0, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setAllowGravity(false);
    this.body.moves = false;
    this.def = null;
    this.sleep();
  }

  /** @param {object} def entity definition straight from the Tiled object layer */
  spawn(def) {
    this.def = def;
    this.setActive(true);
    this.setVisible(true);
    this.setAlpha(1);
    this.body.enable = true;
    this.setPosition(def.x, def.y);
  }

  sleep() {
    this.setActive(false);
    this.setVisible(false);
    this.body.enable = false;
  }

  tick() {}
}

// ---------------------------------------------------------------------------
// Static hazards
// ---------------------------------------------------------------------------

export class Stalagmite extends Entity {
  constructor(scene) {
    super(scene, KEYS.stalagmite);
    this.setOrigin(0.5, 1).setDepth(12);
    this.body.setSize(18, 40, false);
    this.body.setOffset(15, 26);
  }
}

export class Spike extends Entity {
  constructor(scene) {
    super(scene, KEYS.spike);
    this.setOrigin(0.5, 1).setDepth(12);
    this.body.setSize(26, 15, false);
    this.body.setOffset(3, 15);
  }
}

export class Stalactite extends Entity {
  constructor(scene) {
    super(scene, KEYS.stalactite);
    this.setOrigin(0.5, 0).setDepth(12);
    this.tipGlow = scene.add.image(0, 0, KEYS.glow).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    this.tipGlow.setTint(COLORS.rose).setScale(0.5).setVisible(false);
    this.t = 0;
  }

  spawn(def) {
    super.spawn(def);
    const length = def.length || 96;
    this.setDisplaySize(44, length);
    // Body sizes are expressed in source pixels, so divide out the stretch.
    const w = 20 / this.scaleX;
    const h = (length - 18) / this.scaleY;
    this.body.setSize(w, h, false);
    this.body.setOffset((this.width - w) / 2, 10 / this.scaleY);
    this.tipGlow.setVisible(true).setPosition(def.x, def.y + length - 6);
    this.t = 0;
  }

  sleep() {
    super.sleep();
    if (this.tipGlow) this.tipGlow.setVisible(false);
  }

  /** A slow drip-glow at the tip: motion, so the "sharp thing here" cue is not colour-only. */
  tick(dt) {
    this.t += dt;
    const pulse = 0.42 + 0.16 * Math.sin(this.t / 260);
    this.tipGlow.setScale(pulse).setAlpha(0.55 + 0.25 * Math.sin(this.t / 260));
  }
}

// ---------------------------------------------------------------------------
// Creatures — avoid-only, contact from any direction is a hit
// ---------------------------------------------------------------------------

/**
 * Bat: a slow vertical sweep with a hold at each extreme.
 *
 * Telegraph (Section 5): before it leaves an extreme it spreads its wings wide, swells,
 * and leans in the direction it is about to travel. Shape + motion, not colour, so the
 * cue survives colour-blindness.
 */
export class Bat extends Entity {
  static HOLD = 0.18; // fraction of the period spent parked at each extreme
  static MOVE = 0.32;

  constructor(scene) {
    super(scene, KEYS.batOpen);
    this.setDepth(14);
    this.body.setSize(26, 20);
    this.halo = scene.add
      .image(0, 0, KEYS.glow)
      .setDepth(13)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.rose)
      .setVisible(false);
    this.t = 0;
    this.flapT = 0;
    this.open = true;
  }

  spawn(def) {
    super.spawn(def);
    this.t = (def.phase || 0) * (def.period || 2500);
    this.flapT = 0;
    this.halo.setVisible(true);
    this.setScale(1);
  }

  sleep() {
    super.sleep();
    if (this.halo) this.halo.setVisible(false);
  }

  /**
   * Pure motion function: where the bat is, and how far into its wind-up, at clock `t`.
   * Kept separate from tick() so anything that needs to look ahead — the autoplay
   * harness, a future telegraph indicator — can ask without mutating state.
   */
  motionAt(t) {
    const { period = 2500, yTop, yBottom } = this.def;
    const p = (t % period) / period;
    const { HOLD, MOVE } = Bat;

    if (p < HOLD) {
      const telegraph = Phaser.Math.Clamp((p / HOLD - 0.5) * 2, 0, 1);
      return { y: yTop, telegraph, lean: telegraph }; // about to drop
    }
    if (p < HOLD + MOVE) {
      return { y: Phaser.Math.Linear(yTop, yBottom, easeInOut((p - HOLD) / MOVE)), telegraph: 0, lean: 1 };
    }
    if (p < HOLD * 2 + MOVE) {
      const telegraph = Phaser.Math.Clamp(((p - HOLD - MOVE) / HOLD - 0.5) * 2, 0, 1);
      return { y: yBottom, telegraph, lean: -telegraph }; // about to climb
    }
    return {
      y: Phaser.Math.Linear(yBottom, yTop, easeInOut((p - HOLD * 2 - MOVE) / MOVE)),
      telegraph: 0,
      lean: -1
    };
  }

  /** Where this bat will be in `inMs` milliseconds. */
  predictY(inMs) {
    return this.motionAt(this.t + inMs).y;
  }

  tick(dt) {
    this.t += dt;
    const { y, telegraph, lean } = this.motionAt(this.t);

    this.setPosition(this.def.x, y);

    // Wing beat: fast while travelling, and a big slow beat while winding up.
    this.flapT += dt * (telegraph > 0 ? 1.6 : 2.6);
    if (this.flapT > 110) {
      this.flapT = 0;
      this.open = !this.open;
      this.setTexture(this.open ? KEYS.batOpen : KEYS.batClosed);
    }
    if (telegraph > 0) this.setTexture(KEYS.batOpen); // wings held wide during the wind-up

    this.setScale(1 + telegraph * 0.16);
    this.setAngle(lean * 7);
    this.halo
      .setPosition(this.x, this.y)
      .setScale(0.8 + telegraph * 0.7)
      .setAlpha(0.18 + telegraph * 0.35);
  }
}

/**
 * Cave spider: hangs from the ceiling and drops on a beat.
 *
 * Telegraph: a wind-up of roughly a third of the cycle — legs spread, body shakes, silk
 * thread goes taut — before the fast drop. Then it hangs, then reels back up slowly.
 */
export class Spider extends Entity {
  static WINDUP = 0.32;
  static DROP = 0.1;
  static HANG = 0.22;

  constructor(scene) {
    super(scene, KEYS.spiderTuck);
    this.setDepth(14);
    this.body.setSize(22, 20);
    this.thread = scene.add.rectangle(0, 0, 2, 10, COLORS.violet, 0.55).setOrigin(0.5, 0).setDepth(13);
    this.thread.setVisible(false);
    this.t = 0;
  }

  spawn(def) {
    super.spawn(def);
    this.t = (def.phase || 0) * (def.period || 2500);
    this.thread.setVisible(true);
    // Two different heights. The silk is always tied to the ceiling; `hang` is where the
    // spider rests between drops. Left unset it rests at the ceiling, which is the
    // original behaviour. Set lower, the spider dangles in mid-air and becomes an
    // obstacle in the other direction: everything else in this game punishes *not*
    // jumping, and a dangling spider punishes jumping.
    this.ceilingY = def.y;
    this.anchorY = def.hang ?? def.y;
    this.setScale(1);
  }

  sleep() {
    super.sleep();
    if (this.thread) this.thread.setVisible(false);
  }

  /** Pure motion function — see Bat.motionAt. */
  motionAt(t) {
    const { period = 2500, drop } = this.def;
    const p = (t % period) / period;
    const { WINDUP, DROP, HANG } = Spider;
    const anchor = this.anchorY;

    if (p < WINDUP) {
      const windup = Phaser.Math.Clamp((p / WINDUP - 0.35) / 0.65, 0, 1);
      return { y: anchor, windup, spread: windup > 0.15 };
    }
    if (p < WINDUP + DROP) {
      const t2 = (p - WINDUP) / DROP;
      return { y: Phaser.Math.Linear(anchor, drop, t2 * t2), windup: 0, spread: true }; // accelerating fall
    }
    if (p < WINDUP + DROP + HANG) {
      return { y: drop, windup: 0, spread: true };
    }
    const t3 = (p - WINDUP - DROP - HANG) / (1 - WINDUP - DROP - HANG);
    return { y: Phaser.Math.Linear(drop, anchor, easeInOut(t3)), windup: 0, spread: false };
  }

  /** Where this spider will be in `inMs` milliseconds. */
  predictY(inMs) {
    return this.motionAt(this.t + inMs).y;
  }

  tick(dt) {
    this.t += dt;
    const { y, windup, spread } = this.motionAt(this.t);

    // Shake during the wind-up — motion is the readable part of the tell.
    const shake = windup > 0 ? Math.sin(this.t / 26) * windup * 3 : 0;
    this.setPosition(this.def.x + shake, y);
    this.setTexture(spread ? KEYS.spiderSpread : KEYS.spiderTuck);
    this.setScale(1 + windup * 0.14);

    const len = Math.max(2, y - this.ceilingY);
    this.thread.setPosition(this.def.x, this.ceilingY - 4);
    this.thread.setSize(2, len);
    this.thread.setAlpha(0.35 + windup * 0.5);
  }
}

// ---------------------------------------------------------------------------
// Pickups and progression markers
// ---------------------------------------------------------------------------

export class Crystal extends Entity {
  constructor(scene) {
    super(scene, KEYS.crystal);
    this.setDepth(10);
    // Pickups get a *generous* hitbox — the forgiveness rule runs the other way here:
    // if it looks collected, it should count.
    this.body.setSize(30, 38);
    this.t = 0;
  }

  spawn(def) {
    super.spawn(def);
    this.t = def.x * 0.7; // phase by position so a row of crystals shimmers as a wave
    this.setScale(1);
  }

  tick(dt) {
    this.t += dt;
    this.y = this.def.y + Math.sin(this.t / 300) * 3;
    this.setScale(0.92 + 0.08 * Math.sin(this.t / 190), 1);
  }
}

export class Powerup extends Entity {
  constructor(scene) {
    super(scene, KEYS.mushroom);
    this.setDepth(10);
    this.body.setSize(36, 36);
    this.halo = scene.add
      .image(0, 0, KEYS.glow)
      .setDepth(9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.amber)
      .setVisible(false);
    this.t = 0;
  }

  spawn(def) {
    super.spawn(def);
    this.t = 0;
    this.halo.setVisible(true);
  }

  sleep() {
    super.sleep();
    if (this.halo) this.halo.setVisible(false);
  }

  tick(dt) {
    this.t += dt;
    this.y = this.def.y + Math.sin(this.t / 420) * 4;
    const pulse = 1 + 0.1 * Math.sin(this.t / 260);
    this.setScale(pulse);
    this.halo.setPosition(this.x, this.y).setScale(1.1 * pulse).setAlpha(0.3 + 0.12 * Math.sin(this.t / 260));
  }
}

export class Checkpoint extends Entity {
  constructor(scene) {
    super(scene, KEYS.checkpointOff);
    this.setOrigin(0.5, 1).setDepth(8);
    this.body.setSize(34, 86, false);
    this.body.setOffset(3, 0);
    this.t = 0;
  }

  spawn(def) {
    super.spawn(def);
    this.lit = !!def.lit;
    this.setTexture(this.lit ? KEYS.checkpointOn : KEYS.checkpointOff);
    this.t = 0;
  }

  light() {
    this.lit = true;
    this.def.lit = true;
    this.setTexture(KEYS.checkpointOn);
  }

  tick(dt) {
    this.t += dt;
    if (this.lit) this.setScale(1, 1 + 0.03 * Math.sin(this.t / 220));
  }
}

export class Goal extends Entity {
  constructor(scene) {
    super(scene, KEYS.goal);
    this.setOrigin(0.5, 1).setDepth(8);
    this.body.setSize(44, 140, false);
    this.body.setOffset(26, 10);
    this.t = 0;
  }

  spawn(def) {
    super.spawn(def);
    this.t = 0;
  }

  tick(dt) {
    this.t += dt;
    this.setAlpha(0.86 + 0.14 * Math.sin(this.t / 300));
    this.setScale(1 + 0.02 * Math.sin(this.t / 420));
  }
}

/** Which class handles which Tiled object type. */
export const ENTITY_CLASSES = {
  stalagmite: Stalagmite,
  spike: Spike,
  stalactite: Stalactite,
  bat: Bat,
  spider: Spider,
  crystal: Crystal,
  powerup: Powerup,
  checkpoint: Checkpoint,
  goal: Goal
};

/** Overlap grouping: which bucket each type's body belongs to. */
export const ENTITY_GROUPS = {
  stalagmite: 'hazards',
  spike: 'hazards',
  stalactite: 'hazards',
  bat: 'creatures',
  spider: 'creatures',
  crystal: 'pickups',
  powerup: 'pickups',
  checkpoint: 'markers',
  goal: 'markers'
};
