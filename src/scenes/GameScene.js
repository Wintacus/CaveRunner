import Phaser from 'phaser';
import {
  GAME_WIDTH,
  TILE,
  MAX_DELTA_MS,
  CAMERA_LEAD,
  CAMERA_LERP_Y,
  RESPAWN_INVULN_MS,
  SHIELD_INVULN_MS,
  RESPAWN_DELAY_MS,
  CRYSTAL_SCORE,
  COLORS
} from '../config/tuning.js';
import { KEYS } from '../gfx/textures.js';
import { Player } from '../objects/player.js';
import { Director, parseEntities, findSpawn } from '../systems/director.js';
import { Parallax } from '../systems/parallax.js';
import { audio } from '../systems/audio.js';
import { music } from '../systems/music.js';
import { haptics } from '../systems/haptics.js';

const STATE = { RUNNING: 'running', DYING: 'dying', WON: 'won' };

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    // Idempotent, and that is the point: respawning does not touch it, and restarting the
    // level re-runs create() without the music noticing. A restart is the loudest possible
    // way to announce that the player just died.
    // ?music=off silences it.
    if (new URLSearchParams(location.search).get('music') !== 'off') music.start(audio);

    this.state = STATE.RUNNING;
    this.holdFromDevice = false;
    this.elapsed = 0;
    this.deaths = 0;
    this.crystals = 0;
    this.score = 0;
    this.hasShield = false;

    // --- level ---------------------------------------------------------------
    const map = this.make.tilemap({ key: 'level1' });
    const tileset = map.addTilesetImage('cave_tiles', 'cave_tiles');
    this.map = map;

    this.parallax = new Parallax(this);
    // Decor is non-colliding wall veins/rock. Tile bodies are transparent (only the glow
    // draws) so they cannot paint a gray rectangle over the cave.
    map.createLayer('decor', tileset).setDepth(-20).setAlpha(0.85);
    this.ground = map.createLayer('ground', tileset).setDepth(0);
    this.ground.setCollisionByProperty({ collides: true });

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBackgroundColor(COLORS.void);

    const objects = map.getObjectLayer('entities').objects;
    this.spawnPoint = findSpawn(objects, new Phaser.Math.Vector2(160, 448));

    // Signs are plain world-space text, not pooled entities: there are two of them, they
    // never collide with anything, and they exist for the whole level.
    const defs = parseEntities(objects, TILE);
    this.#buildSigns(defs.filter((d) => d.type === 'sign'));
    this.director = new Director(this, defs.filter((d) => d.type !== 'sign'));

    // Respawn state: the level starts as its own checkpoint 0.
    this.checkpoint = { x: this.spawnPoint.x, y: this.spawnPoint.y, score: 0, crystals: 0, shield: false };

    // --- player --------------------------------------------------------------
    this.player = new Player(this, this.spawnPoint.x, this.spawnPoint.y);
    this.player.placeFeetAt(this.spawnPoint.x, this.spawnPoint.y);
    this.player.onLand = () => this.#dust();

    this.physics.add.collider(this.player, this.ground);
    this.physics.add.overlap(this.player, this.director.groups.hazards, (_p, h) => this.#takeHit({ source: h }));
    this.physics.add.overlap(this.player, this.director.groups.creatures, (_p, c) => this.#takeHit({ source: c }));
    this.physics.add.overlap(this.player, this.director.groups.pickups, (_p, item) => this.#collect(item));
    this.physics.add.overlap(this.player, this.director.groups.markers, (_p, marker) => this.#reachMarker(marker));

    this.cameras.main.startFollow(this.player, true, 1, CAMERA_LERP_Y, CAMERA_LEAD - GAME_WIDTH / 2, 0);
    this.cameras.main.fadeIn(240, 5, 7, 13);

    // --- effects -------------------------------------------------------------
    this.sparkles = this.add
      .particles(0, 0, KEYS.spark, {
        lifespan: 480,
        speed: { min: 40, max: 190 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false
      })
      .setDepth(22);

    this.#bindInput();

    this.scene.launch('Hud');
    this.registry.set('score', 0);
    this.registry.set('shield', false);

    this.events.once('shutdown', () => this.scene.stop('Hud'));
  }

  /**
   * Instruction text standing in the cave itself, rather than a tutorial pop-up. The
   * player reads it while running instead of before starting, and it costs no extra
   * screen furniture. Placed above head height so it can never hide the floor or a hazard.
   */
  #buildSigns(signDefs) {
    this.signs = signDefs.map((def) =>
      this.add
        .text(def.x, def.y, def.text, {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          fontStyle: 'bold',
          color: '#ffffff',
          align: 'center',
          padding: { x: 24, y: 18 }
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setAlpha(0)
        .setShadow(0, 0, '#3fe0c8', 10, false, true)
    );
  }

  /** Fade signs in and out at the screen edges so they arrive rather than pop. */
  #updateSigns(cam) {
    if (!this.signs) return;
    for (const sign of this.signs) {
      const fromLeft = sign.x - cam.scrollX;
      const fromRight = cam.scrollX + GAME_WIDTH - sign.x;
      sign.setAlpha(Phaser.Math.Clamp(Math.min(fromLeft, fromRight) / 150, 0, 1));
    }
  }

  // -------------------------------------------------------------------------
  // Input: tap anywhere. No on-screen jump button — small touch targets are exactly
  // the input-precision problem this genre learned to avoid.
  // -------------------------------------------------------------------------
  #bindInput() {
    this.input.addPointer(2); // tolerate a second finger without dropping the first

    this.input.on('pointerdown', (pointer) => {
      if (this.#pointerHitsUi(pointer)) return; // the pause button is not a jump
      if (this.state !== STATE.RUNNING) return;
      this.holdFromDevice = true;
      this.player.requestJump();
    });

    // Both events, because Phaser only emits `pointerup` when the release lands on the
    // canvas element itself; lift a finger over the letterbox bar beside it and you get
    // `pointerupoutside` instead. Listening for one and not the other silently drops the
    // release, and a dropped release is not a small bug: the variable-height boost keeps
    // applying for its full HOLD_MAX_MS, so a 50ms tap that should hop 92px jumps the full
    // 190px. It reads in the hand as the character suddenly floating.
    const release = () => {
      const stillHeld = this.input.manager.pointers.some((p) => p.isDown);
      if (!stillHeld) {
        this.holdFromDevice = false;
        this.player.releaseJump();
      }
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard;
    this.jumpKeys = [];
    if (kb) {
      const down = () => {
        if (this.state !== STATE.RUNNING) return;
        this.holdFromDevice = true;
        this.player.requestJump();
      };
      kb.on('keydown-SPACE', down);
      kb.on('keydown-UP', down);
      // Held state is read off the key objects rather than keyup events, for the same
      // reason as the pointer: a keyup can go missing (window blur mid-press is the usual
      // way) and a missed release is what turns a tap into a full-height jump.
      this.jumpKeys = [kb.addKey('SPACE'), kb.addKey('UP')];
    }
  }

  /**
   * Is any jump input actually held right now?
   *
   * Deliberately derived from live input state every frame rather than tracked through
   * down/up events. Events are the fast path and they are wired up, but every event scheme
   * has some route by which the release goes missing — released over a letterbox bar,
   * pointer cancelled by the OS, window blurred mid-press — and the failure is silent and
   * badly out of proportion: the variable-height boost runs to its cap and every tap
   * becomes a maximum jump until something happens to clear it. State that is recomputed
   * cannot latch.
   */
  #jumpHeld() {
    if (this.input.manager.pointers.some((p) => p.isDown)) return true;
    return this.jumpKeys.some((k) => k.isDown);
  }

  /**
   * Clear a held jump the moment the finger or key that started it is no longer down.
   *
   * Scoped to holds that a *device* started, which matters more than it looks: the
   * autoplay harness drives `requestJump`/`releaseJump` on the player directly and never
   * touches a pointer, so an unscoped version of this reads "nothing is held" every frame
   * and cancels the bot's hold instantly. Every jump it makes becomes a bare tap, and it
   * stops being able to clear the wider pits — 49 deaths and no finish, which is how this
   * got caught.
   */
  #releaseIfDeviceLetGo() {
    if (!this.holdFromDevice || this.#jumpHeld()) return;
    this.holdFromDevice = false;
    this.player.releaseJump();
  }

  /** HUD buttons publish their screen rects; taps inside them must not also jump. */
  #pointerHitsUi(pointer) {
    const rects = this.registry.get('uiRects') || [];
    return rects.some((r) => pointer.x >= r.x && pointer.x <= r.x + r.width && pointer.y >= r.y && pointer.y <= r.y + r.height);
  }

  // -------------------------------------------------------------------------
  update(_time, delta) {
    // Delta-time everything, capped: a 120Hz phone, a 60Hz phone and a phone resuming
    // from the background must all produce the same run.
    const dt = Math.min(delta, MAX_DELTA_MS);

    this.#releaseIfDeviceLetGo();

    if (this.state === STATE.RUNNING) {
      this.elapsed += dt;
      this.player.update(dt);
    }

    const cam = this.cameras.main;
    this.director.update(dt, cam.scrollX, GAME_WIDTH, this.player.x);
    this.parallax.update(cam);
    this.#updateSigns(cam);

    // Falling into a pit costs the same as touching a hazard.
    if (this.state === STATE.RUNNING && this.player.y > this.map.heightInPixels - 40) {
      this.#takeHit({ fromPit: true });
    }
  }

  /**
   * Single owner of shield state, so the flag, the HUD icon and the bubble on the runner
   * can never disagree. `broke` shatters the bubble rather than just hiding it.
   */
  #setShield(active, { broke = false } = {}) {
    this.hasShield = active;
    this.registry.set('shield', active);
    if (broke) this.player.breakShield();
    else this.player.setShield(active);
  }

  // -------------------------------------------------------------------------
  // Damage, shield, respawn
  // -------------------------------------------------------------------------
  #takeHit({ fromPit = false, source = null } = {}) {
    if (this.state !== STATE.RUNNING) return;
    if (this.player.invulnerable && !fromPit) return;

    // Recorded for debugging / the autoplay harness: what actually killed the player.
    this.lastHit = {
      type: fromPit ? 'pit' : source?.def?.type ?? 'unknown',
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      shield: this.hasShield
    };

    // The shield absorbs the hit with no knockback and no interruption — the player just
    // keeps running — and buys a brief window so a second nearby hazard can't double-dip.
    if (this.hasShield && !fromPit) {
      // Shatter first, then start the invincibility flicker — otherwise the two cues
      // overlap and neither reads.
      this.#setShield(false, { broke: true });
      this.player.makeInvulnerable(SHIELD_INVULN_MS);
      this.sparkles.setParticleTint(COLORS.amber);
      this.sparkles.emitParticleAt(this.player.x, this.player.y, 18);
      audio.play('shieldBreak');
      // Dimmer and shorter than a death flash: the shards, shockwave, toast and sound
      // carry this moment, and a full-strength wash would hide the obstacle the player is
      // already lining up a jump for.
      this.cameras.main.flash(190, 205, 155, 75, false);
      // The pickup announces itself with a chime and a toast; the loss deserves the same,
      // or the one moment the shield actually matters passes unnoticed.
      this.events.emit('toast', 'SHIELD LOST', COLORS.amber);
      return;
    }

    this.#die();
  }

  #die() {
    this.state = STATE.DYING;
    this.deaths += 1;
    this.player.setFrozen(true);
    this.player.setVisible(false);
    this.player.setShield(false); // hide the bubble with the runner; respawn restores it

    this.sparkles.setParticleTint(COLORS.rose);
    this.sparkles.emitParticleAt(this.player.x, this.player.y, 24);
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 255, 93, 122, false);
    audio.play('hit');
    haptics.hit();

    this.time.delayedCall(RESPAWN_DELAY_MS, () => this.#respawn());
  }

  #respawn() {
    const cp = this.checkpoint;

    this.score = cp.score;
    this.crystals = cp.crystals;
    this.registry.set('score', this.score);

    this.director.rewindTo(cp.x);

    this.player.setFrozen(false);
    this.player.setVisible(true);
    this.player.placeFeetAt(cp.x, cp.y);
    this.#setShield(cp.shield); // whatever was banked at this checkpoint comes back
    this.player.makeInvulnerable(RESPAWN_INVULN_MS);

    // Snap the camera so the respawn reads instantly instead of sliding into place.
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.setScroll(cp.x - CAMERA_LEAD, cam.scrollY);
    cam.startFollow(this.player, true, 1, CAMERA_LERP_Y, CAMERA_LEAD - GAME_WIDTH / 2, 0);
    cam.fadeIn(180, 5, 7, 13);

    this.state = STATE.RUNNING;
  }

  // -------------------------------------------------------------------------
  // Pickups and markers
  // -------------------------------------------------------------------------
  #collect(item) {
    if (!item.active) return;

    if (item.def.type === 'crystal') {
      this.crystals += 1;
      this.score += CRYSTAL_SCORE;
      this.registry.set('score', this.score);
      this.sparkles.setParticleTint(COLORS.teal);
      this.sparkles.emitParticleAt(item.x, item.y, 6);
      audio.play('crystal', { detune: Phaser.Math.Between(-1, 3) });
    } else if (item.def.type === 'powerup') {
      this.#setShield(true);
      this.sparkles.setParticleTint(COLORS.amber);
      this.sparkles.emitParticleAt(item.x, item.y, 20);
      audio.play('powerup');
      haptics.powerup();
      this.events.emit('toast', 'SHIELD READY', COLORS.amber);
    }

    this.director.consume(item);
  }

  #reachMarker(marker) {
    if (!marker.active) return;

    if (marker.def.type === 'checkpoint') {
      if (marker.lit) return;
      marker.light();
      this.checkpoint = {
        x: marker.def.x,
        y: marker.def.y,
        score: this.score,
        crystals: this.crystals,
        shield: this.hasShield
      };
      this.sparkles.setParticleTint(COLORS.teal);
      this.sparkles.emitParticleAt(marker.x, marker.y - 60, 14);
      audio.play('checkpoint');
      haptics.checkpoint();
      this.events.emit('toast', 'CHECKPOINT', COLORS.teal);
      return;
    }

    if (marker.def.type === 'goal' && this.state === STATE.RUNNING) this.#win();
  }

  #win() {
    this.state = STATE.WON;
    this.player.setFrozen(true);
    this.sparkles.setParticleTint(COLORS.ice);
    this.sparkles.emitParticleAt(this.player.x, this.player.y, 40);
    this.cameras.main.flash(240, 207, 233, 255, false);
    audio.play('win');
    haptics.win();
    music.stop(2.5); // the only place it ends: the run is over, so the loop should be too

    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(280, 5, 7, 13);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('Win', {
          score: this.score,
          crystals: this.crystals,
          totalCrystals: this.director.defs.filter((d) => d.type === 'crystal').length,
          deaths: this.deaths,
          time: this.elapsed
        });
      });
    });
  }

  #dust() {
    this.sparkles.setParticleTint(COLORS.stoneLight);
    this.sparkles.emitParticleAt(this.player.x, this.player.y + 18, 4);
  }

  // -------------------------------------------------------------------------
  // Pause (from the HUD button, or from the app being backgrounded)
  // -------------------------------------------------------------------------
  pauseGame() {
    if (this.scene.isPaused()) return;
    this.player.releaseJump(); // never resume holding a jump the player let go of
    this.scene.pause();
    audio.suspend();
  }

  resumeGame() {
    if (!this.scene.isPaused()) return;
    this.scene.resume();
    audio.resume();
  }

  restartLevel() {
    audio.resume();
    // The scene's own shutdown handler stops the HUD; create() launches a fresh one.
    this.scene.restart();
  }
}
