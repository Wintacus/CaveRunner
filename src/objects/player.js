import Phaser from 'phaser';
import {
  RUN_SPEED,
  JUMP_IMPULSE,
  HOLD_FORCE,
  HOLD_MAX_MS,
  GRAVITY_RISE,
  GRAVITY_FALL,
  MAX_FALL_SPEED,
  COYOTE_MS,
  JUMP_BUFFER_MS,
  PLAYER_BODY_W,
  PLAYER_BODY_H,
  INVULN_FLASH_MS,
  RUN_CYCLE_MS
} from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';
import { audio } from '../systems/audio.js';

/**
 * The runner.
 *
 * Jump model, in order of how it feels:
 *  - press down    -> immediate upward impulse (a bare tap is a small hop)
 *  - held          -> extra upward force for up to HOLD_MAX_MS, giving a taller jump
 *  - release / cap -> normal gravity takes over
 *  - falling       -> heavier gravity than rising, so the arc lands snappy, not floaty
 *  - coyote time   -> a jump still fires shortly after running off an edge
 *  - jump buffer   -> a jump pressed just before landing fires the instant you touch down
 *
 * One discrete jump per tap: holding does not re-trigger, and a second tap in mid-air does
 * nothing except fill the buffer for the upcoming landing.
 *
 * All timing windows are counted down with the frame's (capped) delta rather than read off
 * a wall clock, so a device running at 120Hz, a device running at 60Hz, and a device
 * resuming from the background all behave identically.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, KEYS.player);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(20);
    // Hitbox is smaller than the drawn sprite: near-misses should look near, not fatal.
    this.body.setSize(PLAYER_BODY_W, PLAYER_BODY_H);
    this.body.setMaxVelocityY(MAX_FALL_SPEED);
    this.body.setAllowGravity(true);

    this.coyoteTimer = 0;
    this.bufferTimer = 0;
    this.holdTimer = 0;
    this.holding = false;
    this.jumping = false;
    this.airborne = false;
    this.frozen = false;

    this.invulnTimer = 0;
    this.flashTimer = 0;
    this.runT = 0;

    this.onLand = null; // set by GameScene (dust + camera nudge)
    this.onJump = null;

    this.#buildShieldBubble(scene);
  }

  // -------------------------------------------------------------------------
  // Shield bubble
  //
  // The shield's only previous cue was a small icon in the HUD corner, which is
  // peripheral vision the player never spends attention on mid-run. This puts the state
  // where the eyes already are — on the runner — as a *shape*, so it survives both a
  // glance and colour-blindness, with the amber rim light as reinforcement rather than
  // the signal itself.
  // -------------------------------------------------------------------------
  #buildShieldBubble(scene) {
    this.shielded = false;
    this.bubbleT = 0;
    // Sits just under the runner: the ring is wider than the sprite, so it stays fully
    // visible while the character's own silhouette remains crisp on top.
    this.bubble = scene.add
      .image(this.x, this.y, KEYS.shieldRing)
      .setDepth(this.depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    // Shards carry the runner's own forward speed. Emitted at rest they fall a third of a
    // screen behind within a moment — out of exactly the area the player is watching —
    // which is why the shatter was easy to miss no matter how long it lived.
    this.shards = scene.add
      .particles(0, 0, KEYS.shieldShard, {
        lifespan: { min: 900, max: 1300 },
        speedX: { min: RUN_SPEED - 150, max: RUN_SPEED + 130 },
        speedY: { min: -300, max: 190 },
        rotate: { min: -260, max: 260 },
        scale: { start: 1.15, end: 0.25 },
        alpha: { start: 1, end: 0 },
        gravityY: 240,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false
      })
      .setDepth(this.depth + 1);
  }

  /** Show or hide the bubble. Call whenever the shield is gained, restored or cleared. */
  setShield(active) {
    this.shielded = active;
    this.bubble.setVisible(active && this.visible);
    if (active) {
      this.bubbleT = 0;
      this.bubble.setScale(0.4).setAlpha(0);
      this.scene.tweens.add({
        targets: this.bubble,
        scale: 1,
        alpha: 1,
        duration: 260,
        ease: 'Back.easeOut'
      });
    }
    this.setTexture(this.#poseTexture());
  }

  /** The shield just ate a hit: shatter it, so losing it is as legible as having it. */
  breakShield() {
    if (!this.shielded) return;
    this.shielded = false;
    this.shards.emitParticleAt(this.x, this.y, 22);

    // A shockwave off the character. A large shape that grows is what peripheral vision
    // actually catches — the shards alone read only if you happen to be looking straight
    // at the runner at that instant.
    const wave = this.scene.add
      .image(this.x, this.y, KEYS.shieldRing)
      .setDepth(this.depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.9)
      .setAlpha(0.95);
    this.scene.tweens.add({
      targets: wave,
      scale: 3,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      // Stay with the runner: at 330px/s a wave left behind is off the player's focus
      // before it has finished expanding.
      onUpdate: () => wave.setPosition(this.x, this.y),
      onComplete: () => wave.destroy()
    });

    this.scene.tweens.add({
      targets: this.bubble,
      scale: 1.8,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => this.bubble.setVisible(false)
    });
    this.setTexture(this.#poseTexture());
  }

  /** Position within the stride, 0..1. Two footfalls per cycle, so the pose flips at 0.5. */
  get #runPhase() {
    return (this.runT % RUN_CYCLE_MS) / RUN_CYCLE_MS;
  }

  /** Texture for the current pose, in the current shield state. */
  #poseTexture() {
    if (this.airborne && this.jumping) return this.shielded ? KEYS.playerJumpShield : KEYS.playerJump;
    if (!this.airborne && this.#runPhase < 0.5) {
      return this.shielded ? KEYS.playerRunShield : KEYS.playerRun;
    }
    return this.shielded ? KEYS.playerShield : KEYS.player;
  }

  /** Feet-on-surface placement: the body is centred, so offset by half its height. */
  placeFeetAt(x, surfaceY) {
    this.body.reset(x, surfaceY - PLAYER_BODY_H / 2);
    this.setScale(1, 1);
    this.setAngle(0);
    this.setAlpha(1);
    this.coyoteTimer = 0;
    this.bufferTimer = 0;
    this.holdTimer = 0;
    this.runT = 0;
    this.jumping = false;
    this.airborne = false;
    this.holding = false;
    this.setTexture(this.#poseTexture());
    if (this.bubble) this.bubble.setVisible(this.shielded);
  }

  /** Called on pointer/key down. Always fills the buffer — the buffer decides when it fires. */
  requestJump() {
    this.bufferTimer = JUMP_BUFFER_MS;
    this.holding = true;
  }

  /** Called on pointer/key up: ends the variable-height boost. */
  releaseJump() {
    this.holding = false;
  }

  setFrozen(frozen) {
    this.frozen = frozen;
    if (frozen) {
      this.body.setVelocity(0, 0);
      this.body.setAllowGravity(false);
    } else {
      this.body.setAllowGravity(true);
    }
  }

  makeInvulnerable(ms) {
    this.invulnTimer = ms;
    this.flashTimer = 0;
  }

  get invulnerable() {
    return this.invulnTimer > 0;
  }

  /**
   * Real ground only.
   *
   * Deliberately *not* `|| body.touching.down`. Arcade runs the same separation maths for
   * overlap-only checks as it does for collisions, so `GetOverlapY` sets `touching.down`
   * on any body that is falling when it overlaps another one — including the crystals,
   * checkpoints and creatures the player only ever *overlaps*. That made brushing a
   * crystal on the way down count as a landing: it cleared `jumping`, refilled coyote
   * time, and handed the player a genuine mid-air second jump for the next 140ms (plus a
   * landing thud and dust puff in mid-air). The only thing this game actually collides
   * with is the ground tilemap, and tile separation sets `blocked.down`.
   */
  get onGround() {
    return this.body.blocked.down;
  }

  update(dt) {
    if (this.frozen) return;

    const grounded = this.onGround;

    if (grounded) {
      this.coyoteTimer = COYOTE_MS;
      if (this.airborne) this.#land();
      this.airborne = false;
      this.jumping = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      this.airborne = true;
    }

    this.bufferTimer = Math.max(0, this.bufferTimer - dt);

    // Fire a buffered jump as soon as it is legal (on the ground, or inside coyote time).
    if (this.bufferTimer > 0 && !this.jumping && (grounded || this.coyoteTimer > 0)) this.#startJump();

    // Variable height: the boost lasts only while the finger stays down, capped.
    if (this.jumping && this.holding && this.holdTimer > 0 && this.body.velocity.y < 0) {
      this.holdTimer = Math.max(0, this.holdTimer - dt);
      this.body.setGravityY(GRAVITY_RISE - HOLD_FORCE);
    } else {
      this.holdTimer = 0;
      // Asymmetric gravity: falling is heavier than rising.
      this.body.setGravityY(this.body.velocity.y < 0 ? GRAVITY_RISE : GRAVITY_FALL);
    }

    this.body.setVelocityX(RUN_SPEED);

    this.#updateInvuln(dt);
    this.#updatePose(dt);
    this.#updateShieldBubble(dt);
  }

  #startJump() {
    this.body.setVelocityY(-JUMP_IMPULSE);
    this.jumping = true;
    this.airborne = true;
    this.holdTimer = HOLD_MAX_MS;
    this.bufferTimer = 0;
    this.coyoteTimer = 0;

    this.setTexture(this.shielded ? KEYS.playerJumpShield : KEYS.playerJump);
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.82,
      scaleY: 1.22,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    audio.play('jump', { detune: Phaser.Math.FloatBetween(-0.7, 0.7) });
    if (this.onJump) this.onJump();
  }

  #land() {
    this.setTexture(this.#poseTexture());
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.18,
      scaleY: 0.8,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut'
    });
    audio.play('land', { detune: Phaser.Math.FloatBetween(-0.6, 0.6), volume: 0.9 });
    if (this.onLand) this.onLand();
  }

  #updateInvuln(dt) {
    if (this.invulnTimer <= 0) return;
    this.invulnTimer -= dt;
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flashTimer = INVULN_FLASH_MS;
      this.setAlpha(this.alpha > 0.6 ? 0.35 : 1);
    }
    if (this.invulnTimer <= 0) {
      this.invulnTimer = 0;
      this.setAlpha(1);
    }
  }

  #updateShieldBubble(dt) {
    if (!this.bubble.visible) return;
    this.bubbleT += dt;
    this.bubble.setPosition(this.x, this.y);
    // Spin plus a slow breath. The spin is what catches the eye without demanding it.
    this.bubble.rotation += dt * 0.0009;
    if (!this.scene.tweens.isTweening(this.bubble)) {
      this.bubble.setScale(1 + 0.05 * Math.sin(this.bubbleT / 260));
      this.bubble.setAlpha(0.8 + 0.2 * Math.sin(this.bubbleT / 210));
    }
  }

  /**
   * Lean and stretch with the arc — cheap, and it sells the weight of the jump.
   *
   * On the ground the art is a single PNG with no sprite sheet, so the run is two stamped
   * frames that differ by a lift and a squash (see `stampRunnerArt`). Nothing rotates: an
   * earlier version rocked the whole sprite +/-7 degrees in time with the swap, on top of
   * 11 degrees of tilt already baked into the two frames, and a character pivoting about
   * its feet reads as rocking on the spot rather than running. Jump and land squash tweens
   * still own scale while they run.
   */
  #updatePose(dt) {
    const vy = this.body.velocity.y;
    if (this.airborne) {
      this.setAngle(Phaser.Math.Clamp(vy * 0.014, -10, 14));
      if (!this.scene.tweens.isTweening(this)) {
        const stretch = Phaser.Math.Clamp(1 + Math.abs(vy) / 4200, 1, 1.12);
        this.setScale(2 - stretch, stretch);
      }
    } else {
      this.runT = (this.runT + dt) % RUN_CYCLE_MS;
      this.setAngle(Phaser.Math.Linear(this.angle, 0, 0.35));
      // The pose is a *texture* swap, so it is not gated on the squash tweens the way a
      // scale write would have to be — the two never touch the same property. It was
      // gated, behind `!isTweening(this)`, and that is why the gait never appeared at all:
      // a land tween parks itself in the manager and never advances (elapsed stays 0 with
      // the tween ACTIVE), so the guard was permanently false and the runner held a single
      // frame for the whole level. Scale is left alone here; the squash tweens yoyo back to
      // 1 themselves and `placeFeetAt` resets it on respawn.
      this.setTexture(this.#poseTexture());
    }
  }
}
