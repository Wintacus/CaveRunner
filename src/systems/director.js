import Phaser from 'phaser';
import { ACTIVATION_MARGIN, RECYCLE_MARGIN } from '../config/tuning.js';
import { ENTITY_CLASSES, ENTITY_GROUPS } from '../objects/entities.js';

/**
 * Streams the level's entities in and out around the camera, from fixed pools.
 *
 * Nothing is created or destroyed during play: an entity that scrolls off the left is put
 * back in its pool and reused by the next definition of the same type. With ~290 objects
 * in the level, at most a couple of dozen exist at any moment.
 *
 * `defs` carry the mutable per-run state (`taken` for pickups, `lit` for checkpoints), so
 * a respawn can rewind the world simply by clearing those flags from the checkpoint
 * onward and rewinding the spawn cursor.
 */
export class Director {
  constructor(scene, defs) {
    this.scene = scene;
    this.defs = [...defs].sort((a, b) => a.x - b.x);
    this.cursor = 0;
    this.pools = new Map(); // type -> { free: Entity[], active: Entity[] }
    this.groups = {
      hazards: scene.add.group(),
      creatures: scene.add.group(),
      pickups: scene.add.group(),
      markers: scene.add.group()
    };
  }

  #pool(type) {
    let pool = this.pools.get(type);
    if (!pool) {
      pool = { free: [], active: [] };
      this.pools.set(type, pool);
    }
    return pool;
  }

  #obtain(def, playerX) {
    const pool = this.#pool(def.type);
    let entity = pool.free.pop();
    if (!entity) {
      const Klass = ENTITY_CLASSES[def.type];
      if (!Klass) return null;
      entity = new Klass(this.scene);
      this.groups[ENTITY_GROUPS[def.type]].add(entity);
    }
    entity.spawn(def, playerX);
    pool.active.push(entity);
    return entity;
  }

  #release(entity) {
    const pool = this.#pool(entity.def.type);
    const i = pool.active.indexOf(entity);
    if (i !== -1) pool.active.splice(i, 1);
    entity.sleep();
    pool.free.push(entity);
  }

  /** Remove an entity from play for the rest of this life (collected pickups). */
  consume(entity) {
    entity.def.taken = true;
    this.#release(entity);
  }

  /**
    * `playerX` is passed down to spawning creatures so they can wind their cycle clock back
    * by the journey still ahead of the runner. Without it the beat would depend on how far
    * away the creature happened to wake, which differs between a clean run-up and a respawn
    * at a nearby checkpoint.
    */
  update(dt, scrollX, viewWidth, playerX) {
    const wakeAt = scrollX + viewWidth + ACTIVATION_MARGIN;
    const sleepAt = scrollX - RECYCLE_MARGIN;

    while (this.cursor < this.defs.length && this.defs[this.cursor].x <= wakeAt) {
      const def = this.defs[this.cursor++];
      if (!def.taken) this.#obtain(def, playerX);
    }

    for (const pool of this.pools.values()) {
      for (let i = pool.active.length - 1; i >= 0; i--) {
        const entity = pool.active[i];
        if (entity.def.x < sleepAt) this.#release(entity);
        else entity.tick(dt);
      }
    }
  }

  /**
   * Rewind the world to a checkpoint: everything currently on stage goes back to its pool,
   * pickups taken after the checkpoint come back, and the spawn cursor jumps back so the
   * upcoming stretch repopulates. Creatures reseed their clocks from the distance the
   * runner has left to cover, so the beat after a respawn matches the beat on the run-up.
   */
  rewindTo(x) {
    for (const pool of this.pools.values()) {
      for (let i = pool.active.length - 1; i >= 0; i--) this.#release(pool.active[i]);
    }
    for (const def of this.defs) {
      if (def.x >= x && def.type !== 'checkpoint') def.taken = false;
    }
    const from = x - 400;
    this.cursor = this.defs.findIndex((d) => d.x >= from);
    if (this.cursor === -1) this.cursor = this.defs.length;
  }

  /** Debug/telemetry: how many objects were ever constructed. */
  get poolSize() {
    let n = 0;
    for (const pool of this.pools.values()) n += pool.free.length + pool.active.length;
    return n;
  }
}

/**
 * Turn raw Tiled objects into entity definitions.
 * Multi-tile spike clusters are expanded here into one pooled spike per tile, which keeps
 * every hazard sprite a uniform size (no stretched art, no bespoke body maths).
 */
export function parseEntities(objects, tileSize) {
  const defs = [];
  for (const obj of objects) {
    const props = {};
    if (Array.isArray(obj.properties)) for (const p of obj.properties) props[p.name] = p.value;
    else if (obj.properties) Object.assign(props, obj.properties);

    const type = obj.type || obj.name;
    if (type === 'spawn') continue;

    if (type === 'spikes') {
      const count = Math.max(1, Math.round((props.width || tileSize) / tileSize));
      const left = obj.x - (count * tileSize) / 2 + tileSize / 2;
      for (let i = 0; i < count; i++) defs.push({ type: 'spike', x: left + i * tileSize, y: obj.y });
      continue;
    }

    defs.push({ type, x: obj.x, y: obj.y, ...props });
  }
  return defs;
}

/** The spawn point object, in world pixels. */
export function findSpawn(objects, fallback) {
  const spawn = objects.find((o) => (o.type || o.name) === 'spawn');
  return spawn ? new Phaser.Math.Vector2(spawn.x, spawn.y) : fallback;
}
