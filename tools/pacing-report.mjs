// Pacing report: how often does the player actually have something to do?
//
// Device testing found long stretches of "watching the character move". This counts the
// beats that demand an input (pit lips, ground hazards, creatures) and reports the dead
// air between them, so pacing can be judged from numbers rather than vibes.
//
// Usage: node tools/pacing-report.mjs
import { PLATFORMS, ENTITIES, SEGMENTS, TILE } from '../src/level/level1.js';
import { RUN_SPEED } from '../src/config/tuning.js';

const plats=[...PLATFORMS].sort((a,b)=>a.x-b.x);
const beats=[];
for(let i=1;i<plats.length;i++){
  const a=plats[i-1],b=plats[i];const s=a.x+a.w;
  if(b.x>s) beats.push({x:s,kind:`pit(${b.x-s})`});
}
for(const e of ENTITIES){
  if(['stalagmite','spikes','stalactite'].includes(e.type)) beats.push({x:e.x,kind:e.type});
  if(['bat','spider'].includes(e.type)) beats.push({x:e.x,kind:e.type});
}
beats.sort((a,b)=>a.x-b.x);

const goal=ENTITIES.find(e=>e.type==='goal').x;
const secPerTile=TILE/RUN_SPEED;
console.log(`run speed ${RUN_SPEED}px/s -> ${(1/secPerTile).toFixed(2)} tiles/s; level ${goal} tiles = ${(goal*secPerTile).toFixed(1)}s`);
console.log(`interaction beats: ${beats.length} -> one every ${(goal/beats.length*secPerTile).toFixed(2)}s on average\n`);

// idle stretches between beats
const gaps=[];
let prev=0;
for(const b of beats){ gaps.push({from:prev,to:b.x,tiles:b.x-prev,next:b.kind}); prev=b.x; }
gaps.push({from:prev,to:goal,tiles:goal-prev,next:'goal'});
gaps.sort((a,b)=>b.tiles-a.tiles);
console.log('longest stretches with nothing to do:');
for(const g of gaps.slice(0,10))
  console.log(`  ${String(g.tiles).padStart(3)} tiles = ${(g.tiles*secPerTile).toFixed(1)}s  (x ${g.from}-${g.to}, then ${g.next})`);

console.log('\nper segment:');
for(const s of SEGMENTS){
  const n=beats.filter(b=>b.x>=s.from&&b.x<s.to).length;
  const dur=(s.to-s.from)*secPerTile;
  const idle=gaps.filter(g=>g.from>=s.from&&g.from<s.to&&g.tiles*secPerTile>2.5);
  console.log(`  ${s.name.padEnd(20)} ${dur.toFixed(0)}s, ${String(n).padStart(2)} beats = one every ${(dur/n).toFixed(1)}s; ${idle.length} lulls over 2.5s`);
}
const idleTotal=gaps.filter(g=>g.tiles*secPerTile>2.5).reduce((a,g)=>a+g.tiles*secPerTile,0);
console.log(`\ntime spent in lulls longer than 2.5s: ${idleTotal.toFixed(0)}s of ${(goal*secPerTile).toFixed(0)}s (${(idleTotal/(goal*secPerTile)*100).toFixed(0)}%)`);
