// Compiles src/level/level1.js into public/assets/levels/level1.tmj — a real Tiled
// map (Tiled 1.10 JSON). The game loads the .tmj; the .tmj can also be opened and
// edited directly in Tiled, and re-running this script regenerates it from the
// authored source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, DECOR, ENTITIES, SPAWN, MAP_W, MAP_H, TILE, CEIL_BOTTOM } from '../src/level/level1.js';
import { validateLevel } from './validate-level.mjs';

// gid = tileset id + 1 (see tools/build-tileset.mjs)
const GID = {
  GROUND_TOP: 1,
  GROUND_FILL: 2,
  CEIL_BOTTOM: 3,
  CEIL_FILL: 4,
  LEDGE_TOP: 5,
  LEDGE_FILL: 6,
  BG_ROCK: 7,
  BG_VEIN: 8
};

const size = MAP_W * MAP_H;
const ground = new Array(size).fill(0);
const decor = new Array(size).fill(0);
const put = (arr, x, y, gid) => {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
  arr[y * MAP_W + x] = gid;
};

// Ceiling across the whole map: bottom row carries the glowing moss lip.
for (let x = 0; x < MAP_W; x++) {
  for (let y = 0; y < CEIL_BOTTOM; y++) {
    put(ground, x, y, y === CEIL_BOTTOM - 1 ? GID.CEIL_BOTTOM : GID.CEIL_FILL);
  }
}

// Background decoration (drawn behind the play space, never collides).
for (const d of DECOR) {
  for (let x = d.x; x < d.x + d.w; x++) {
    for (let y = d.y; y < d.y + d.h; y++) put(decor, x, y, d.kind === 'vein' ? GID.BG_VEIN : GID.BG_ROCK);
  }
}

// Solid platforms.
for (const p of PLATFORMS) {
  const isLedge = p.kind === 'ledge';
  const bottom = isLedge ? p.top + 2 : MAP_H - 1;
  for (let x = p.x; x < p.x + p.w; x++) {
    for (let y = p.top; y <= bottom; y++) {
      const top = y === p.top;
      put(ground, x, y, isLedge ? (top ? GID.LEDGE_TOP : GID.LEDGE_FILL) : top ? GID.GROUND_TOP : GID.GROUND_FILL);
    }
  }
}

// --- entities -> Tiled objects ----------------------------------------------
let nextId = 1;
const prop = (name, value) => ({
  name,
  type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'float' : 'string',
  value
});

/**
 * Pixel conversion: px = tileCoord * TILE, so an integer y is the *top edge* of that
 * row (i.e. row 14 == the walkable surface) and y=12.5 is the middle of row 12.
 * Grounded sprites anchor their bottom to that line; floating ones centre on it.
 */
const objects = ENTITIES.map((e) => {
  const props = [];
  let x = (e.x + 0.5) * TILE;
  let y = e.y !== undefined ? e.y * TILE : CEIL_BOTTOM * TILE;

  switch (e.type) {
    case 'spikes':
      x = (e.x + e.w / 2) * TILE;
      props.push(prop('width', e.w * TILE));
      break;
    case 'checkpoint':
      props.push(prop('index', e.index));
      break;
    case 'sign':
      props.push(prop('text', e.text));
      break;
    case 'stalactite':
      props.push(prop('length', e.len * TILE));
      break;
    case 'bat':
      props.push(prop('yTop', e.yTop * TILE), prop('yBottom', e.yBottom * TILE));
      props.push(prop('period', e.period), prop('phase', e.phase));
      y = e.yTop * TILE;
      break;
    case 'spider':
      props.push(prop('drop', e.drop * TILE), prop('period', e.period), prop('phase', e.phase));
      if (e.hang !== undefined) props.push(prop('hang', e.hang * TILE));
      break;
    default:
      break;
  }

  return {
    id: nextId++,
    name: e.type,
    type: e.type,
    class: e.type,
    point: true,
    rotation: 0,
    visible: true,
    width: 0,
    height: 0,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    ...(props.length ? { properties: props } : {})
  };
});

objects.push({
  id: nextId++,
  name: 'spawn',
  type: 'spawn',
  class: 'spawn',
  point: true,
  rotation: 0,
  visible: true,
  width: 0,
  height: 0,
  x: (SPAWN.x + 0.5) * TILE,
  y: SPAWN.y * TILE
});

const collides = (id) => ({ id, properties: [prop('collides', id <= 5)] });

const map = {
  backgroundcolor: '#05070d',
  compressionlevel: -1,
  height: MAP_H,
  infinite: false,
  layers: [
    { id: 1, name: 'decor', type: 'tilelayer', opacity: 1, visible: true, x: 0, y: 0, width: MAP_W, height: MAP_H, data: decor },
    { id: 2, name: 'ground', type: 'tilelayer', opacity: 1, visible: true, x: 0, y: 0, width: MAP_W, height: MAP_H, data: ground },
    {
      id: 3,
      name: 'entities',
      type: 'objectgroup',
      draworder: 'topdown',
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
      objects
    }
  ],
  nextlayerid: 4,
  nextobjectid: nextId,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.10.2',
  tileheight: TILE,
  tilesets: [
    {
      columns: 4,
      firstgid: 1,
      image: '../tilesets/cave_tiles.png',
      imageheight: 64,
      imagewidth: 128,
      margin: 0,
      name: 'cave_tiles',
      spacing: 0,
      tilecount: 8,
      tileheight: TILE,
      tilewidth: TILE,
      tiles: [0, 1, 2, 3, 4, 5, 6, 7].map(collides)
    }
  ],
  tilewidth: TILE,
  type: 'map',
  version: '1.10',
  width: MAP_W
};

console.log('validating level…');
const { errors } = validateLevel();
if (errors.length) {
  console.error(`\n${errors.length} error(s) — map not written.`);
  process.exit(1);
}

const outDir = path.resolve(fileURLToPath(new URL('../public/assets/levels', import.meta.url)));
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'level1.tmj');
fs.writeFileSync(outFile, JSON.stringify(map));
console.log(
  `level  -> ${path.relative(process.cwd(), outFile)} ` +
    `(${MAP_W}x${MAP_H} tiles, ${objects.length} objects, ${(fs.statSync(outFile).size / 1024).toFixed(0)}KB)`
);
