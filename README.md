# Cave Runner

A 2D side-scrolling auto-runner set in a bioluminescent cave. One complete, hand-crafted
level; the only input is tap-to-jump. Phaser 3 + Arcade Physics, a Tiled level, Vite for
the web build, Capacitor for iOS/Android.

Built to the spec in `docs/game-spec.md`.

```bash
npm install
npm run dev        # http://localhost:5173 (also served on the LAN for phone testing)
npm run build      # regenerates assets + builds to dist/
npm test           # validate the level, smoke test, and a full autoplay run
```

---

## How it plays

You run right at a constant 370px/s. Tapping jumps; holding the tap jumps higher, up to a
270ms cap. A tap is a ~82px hop, a full hold is ~190px — enough to clear the widest pit in
the level with room to spare, and enough to clip a stalactite if you over-commit.

Height is set by gravity alone, so it does not move with the run speed — but *reach* does.
At 370px/s a full hold covers 314px of flat ground, which is why the pits are 4-6 tiles
wide rather than the 3-5 they were at 330: the speed and the gaps have to move together or
a faster runner just gets an easier level.

The level is ~70 seconds of clean running, split into four segments by three checkpoints:

| Segment | Tiles | Time | Introduces |
|---|---|---|---|
| 1 — Entrance | 0–168 | ~15s | The jump. Widening gaps, a few stalagmites, no creatures. |
| 2 — Bats | 168–393 | ~20s | Bats: slow vertical sweeps. Terrain stays simple. |
| 3 — Spiders + combined | 393–655 | ~23s | Ceiling spiders, then everything at once. Hardest stretch. |
| 4 — Finale | 655–812 | ~15s | Remix only: a staircase of lit ledges over open pits, then a clear run to the goal. |

Checkpoints sit at tiles 166, 376 and 648. The shield mushroom is at tile 386 — right
after checkpoint 2, banked immediately before the hardest section.

---

## Game feel

Everything that decides how the jump feels is in `src/config/tuning.js`, in one screen of
constants. The controller (`src/objects/player.js`) implements:

- **Tap-and-hold variable height.** Press-down applies an immediate impulse; while held (up
  to `HOLD_MAX_MS`) an extra upward force keeps applying. One discrete jump per tap — no
  flapping, no double jump.
- **Asymmetric gravity.** `GRAVITY_FALL` is 1.7x `GRAVITY_RISE`, so the arc lands snappy
  instead of floaty.
- **Coyote time** (`COYOTE_MS`, 140ms) — jumping just after stepping off an edge still works.
- **Jump buffering** (`JUMP_BUFFER_MS`, 150ms) — a tap just before landing fires on touchdown.
- **Releases are derived, not trusted.** Phaser emits `pointerup` only when the finger lifts
  *on the canvas element*; lift it over the letterbox bar beside the canvas and you get
  `pointerupoutside` instead. Both are handled, and on top of that the held state is
  recomputed from live pointer/key state every frame, so it cannot latch. The failure this
  guards against is silent and wildly out of proportion: a dropped release leaves the
  variable-height boost running to its 270ms cap, so a 50ms tap that should hop 92px jumps
  the full 190px. The per-frame check is scoped to holds a device started — the autoplay
  harness drives the player API directly and an unscoped version cancels its holds.
- **Delta time everywhere,** capped at `MAX_DELTA_MS`. Timing windows are counted down with
  the frame delta rather than read off a wall clock, and Arcade runs in `fixedStep` mode, so
  a 60Hz phone, a 120Hz phone and a phone resuming from the background all play identically.

Forgiveness: the player's hitbox is 20x34 inside a 30x42 sprite, and hazard/creature bodies
are similarly inset. Pickups go the other way — their hitboxes are slightly *larger* than
the art, because a crystal that looks collected should count.

### Tuning on a real device

`?debug=1` on the URL draws the Arcade bodies and the haptics readout. Change numbers in
`src/config/tuning.js`, save, and Vite hot-reloads on the phone. If the tap-and-hold
mechanic doesn't feel right in the hand, the fallback to a fixed-height jump is a two-line
change: drop `HOLD_FORCE` to 0 in the same file.

`?perf=1` prints what the device is actually doing — fps, median and worst frame time, the
renderer in use, and live object counts. It deliberately does *not* draw the physics bodies,
because those outlines cost enough to distort the numbers.

The line to read is `sim`. Phaser is configured with `fps: { min: 30, smoothStep: true }`,
which clamps the delta handed to the simulation, so a device slower than that stops
advancing real time and runs in **slow motion** rather than dropping frames. `raw` is the
real frame time and `sim` is what the game believed; when they diverge the readout says
`SLOW-MO` and counts the clamped frames. A phone at 24fps in slow motion and a phone at
55fps with a rendering glitch look equally wrong to the eye and need opposite fixes, which
is the distinction this exists to make.

---

## Level pipeline

The level is authored in `src/level/level1.js` — hand-placed platforms, hazards, creatures,
checkpoints and crystals, in tile coordinates. `npm run assets` compiles it into
`public/assets/levels/level1.tmj`, a real Tiled 1.10 map, which is what the game loads. The
`.tmj` opens and edits directly in Tiled if you'd rather work visually; re-running
`npm run assets` regenerates it from the authored source.

Compiling runs `tools/validate-level.mjs` first, which simulates the actual jump arc from
the tuning constants and refuses to write a map that fails:

- every pit checked against the real reach for its width *and* its step-up/step-down
- warnings for jumps with under 20% margin
- entities buried in rock, floating over pits, or sitting at the wrong surface height
- **creature reach**: a bat at the bottom of its sweep, or a spider at full extension, must
  actually intersect a runner standing on the ground below it, or it is a decorative threat —
  and must not reach *through* that surface either. Both are measured against the surface
  under the creature rather than the global floor row, since a creature over a ledge can sit
  well above row 14 and still be buried in the slab it is flying over
- **anything hoppable, too close to a pit lip**: stalagmites, spikes, and any creature that
  reaches the ground lane. Hopping one commits you to a fixed arc, so if the next lip is
  nearer than the shortest possible hop, the hop itself lands in the pit and there is no
  fair line through
- **spiders that move while you cross them**: the runner's x at any instant is fixed by the
  constant scroll speed, so the only answers to a spider are vertical — under it, or over
  it. One that enters or leaves the lane mid-crossing answers both, and no telegraph helps.
  One check covers every approach, because arrival timing no longer depends on wake distance
- **dangling spiders**: enough headroom to run under, low enough to matter, never in the
  flight path of a jump the player has no choice about (a pit) or within one hop of a
  ground hazard
- **spider settle time**: a spider that is down when the player reaches it must have landed
  at least 400ms earlier. "Not mid-drop" is a weaker promise than it sounds — one that lands
  94ms before the crossing passes that check and is still, in play, a spider arriving on the
  player's head
- checkpoint/power-up/goal counts, and a pacing report per segment

Change `RUN_SPEED` or any jump constant and the validator re-checks the whole level against
the new physics — including regenerating the crystal arcs, which are sampled from the real
jump trajectory rather than hand-drawn.

`npm run pacing` (tools/pacing-report.mjs) reports the other half of level quality: how
often the player actually has something to do. It counts the beats that demand an input and
measures the dead air between them. Current level: one beat every 1.17s, and no lull over 2.5s
anywhere in the run — down from 1.70s and 36% of the run before the first pacing pass.

---

## Creatures and telegraphing

Both creature types are avoid-only — contact from any direction is a hit — and both move on
a readable, rhythmic pattern, never randomly.

- **Bats** sweep vertically and pause at each extreme. Before leaving an extreme they spread
  their wings wide, swell, and lean in the direction they're about to travel.
- **Spiders** hang from the ceiling and drop on a beat: wind-up (legs spread, body shaking,
  silk thread taut), then the drop, a hang, and a slow retract. The cycle fractions live in
  `src/config/tuning.js` because the validator models the same motion. The drop used to be
  10% of the cycle — 352px in ~240ms, near 1500px/s — which device testing found
  unreadable: the spider sat on the ceiling for the whole approach and arrived on the
  player's head. It is now 18%, so the fall itself is the telegraph, with a longer hang so
  it stands in the way as an obstacle rather than an ambush.
- **Dangling spiders** (`hang` on the def) rest partway down instead of at the ceiling. The
  silk still runs to the ceiling; only the resting height moves. This is the one obstacle in
  the game that punishes *jumping* rather than not jumping: it occupies a band of air, so
  running underneath is always safe and leaving the ground near it may not be. Three of them
  are placed, at tiles 436, 583 and 660.

Every spider is timed to ask the player something at the moment they reach it. Five are on
the floor and have to be jumped; two are dangling at head height, where no jump clears them
and the answer is to stay on the ground; two are climbing away as the player arrives, low
enough to read as an obstacle when they are already leaving. Four of the nine used to be
parked at the ceiling as the player ran underneath, which is a pooled object and a piece of
level spent on nothing.

The climbing pair are a deliberate fake-out, and worth stating precisely: running straight
through is clean, a *tap* is a hit, and a full hold clears over the top. What gets punished
is the hesitant hop, not the commitment.

Every cue is shape + motion, not colour, so it reads for colourblind players.

Creature phase is deterministic *relative to the player's approach*: a creature winds its
clock back by the journey the runner still has to make, so it is at `phase * period +
APPROACH_MS` at the instant you reach it — from any distance, on any approach. The beat you
learn on attempt 3 is the beat you get on attempt 30.

This used to be seeded from the moment a creature woke instead, which tied the beat to how
far away it happened to wake. That is not constant: respawning at a checkpoint 384px short
of a creature wakes it immediately, delivering you two seconds earlier in its cycle than a
clean run-up does. One spider was consequently dangling overhead on the approach — run
under it — and lying in the lane after every respawn — jump it — from a single `phase`,
which made every death in the finale a guaranteed second death. Measured after the fix, the
cycle time at the crossing agrees to within one frame across wake distances from 160px to
909px.

---

## Death, checkpoints, and the shield

- A hit without the shield sends you back to the last checkpoint, with 1.6s of invincibility
  (the sprite flickers) so a hazard near the checkpoint can't instantly re-kill you.
- The shield is worn visibly: a spinning ring around the runner plus an amber rim light,
  and it shatters into shards when spent. The state lives on the character rather than in
  a HUD corner because that is where the player's eyes are during a run.
- With the shield, a hit is absorbed with **no knockback and no interruption** — you keep
  running — the mushroom is consumed, and you get 1.4s of invincibility so a second nearby
  hazard can't double-dip.
- Falling into a pit costs the same as a hit and always sends you back to the checkpoint.
  Respawning restores the score, crystal count and shield state you had *at* that checkpoint,
  and any pickups after it come back.

---

## Mobile specifics

- **Gesture locking** (`src/systems/lifecycle.js`, `index.html`): viewport meta kills
  pinch/double-tap zoom; `touch-action: none` and `overscroll-behavior: none` kill
  pull-to-refresh and rubber-banding; `touchmove`, `contextmenu` and iOS `gesture*` events
  are cancelled. This matters because players tap and hold rapidly near the top of the
  screen, which is exactly where those gestures live.
- **Canvas fit.** `#game` is `position: fixed`, and on iOS a fixed element sizes to the
  *layout* viewport, which stays full height whether or not the browser chrome is on screen
  — so the canvas gets fitted into an area partly hidden behind that chrome and drawn
  smaller than the room available. Phaser's ScaleManager only listens to `resize` and
  `orientationchange`, and iOS reports the chrome collapsing on `visualViewport` instead, so
  the stale size survives until something else forces a re-fit. `trackVisualViewport`
  (`src/systems/lifecycle.js`) drives the container height from `visualViewport` and
  re-measures on every viewport signal. Note that `ScaleManager.refresh()` re-runs the fit
  maths but does *not* re-measure the parent — `getParentBounds()` does, and without it the
  new size is only picked up by Phaser's own 500ms poll.
- **Safe areas, landscape-first.** In landscape the notch moves to the *side*, so the HUD is
  laid out from `env(safe-area-inset-*)` read through a hidden probe element and converted
  to game units. A 20px minimum buffer is applied on every edge regardless, because some
  devices have unreported touch dead zones along landscape edges.
- **Auto-pause.** Capacitor's App API (plus `visibilitychange`/`blur` on the web) pauses the
  game loop and suspends audio the moment the app is backgrounded; it never auto-resumes
  gameplay — you come back to the pause menu.
- **Orientation.** Landscape-locked where the platform allows it, with a CSS "rotate your
  device" overlay everywhere else.

### Building the native apps

Capacitor is configured (`capacitor.config.json`, `webDir: dist`) but the native projects
are not committed. To create them:

```bash
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
npm run cap:sync            # build + copy web assets into the native projects
npx cap open ios            # or: npx cap open android
```

For App Store submission you'll eventually need a `PrivacyInfo.xcprivacy` privacy manifest —
standard for Capacitor apps that use certain APIs. Nothing to do at build time; noted here so
it isn't a surprise at submission.

---

## Audio and haptics

Sound effects are synthesised through the Web Audio API in `src/systems/audio.js` — no files,
no licences, no download. Jump take-off and landing are two separate layered sounds, both
kept quiet and pitch-randomised by a few cents because they play dozens of times per run.
Checkpoint, power-up, crystal, hit and win each have their own cue.

Mobile audio unlock is handled where it has to be: the AudioContext is *created* at boot but
never played until the Start screen's tap handler, which resumes it and pushes a silent
buffer through — the first guaranteed user gesture in the session.

To swap in sampled SFX from a free pack (Pixabay, OpenGameArt, itch), load them in
`PreloadScene` and replace the body of `AudioManager.play()`. The unlock flow, suspend/resume
and every call site stay as they are.

Haptics (`src/systems/haptics.js`) use Capacitor's Haptics plugin with `navigator.vibrate` as
the web fallback, and fire only on hit/death, checkpoint, power-up and level complete —
deliberately not on jumps or crystals, which would be constant background buzz.

---

## Art

All sprites, the parallax layers and the tileset are drawn procedurally
(`src/gfx/textures.js`, `tools/build-tileset.mjs`): dark stone silhouettes with glowing rim
light, plus three parallax depth layers and drifting spores. There are no binary art assets
to manage yet, and the whole look is one file to re-tune.

**Swapping in AI-generated sprites**: `KEYS` and `SPRITE_SIZES` in `src/gfx/textures.js` list
every texture key the game uses and the size each one expects. Generate transparent-background
PNG sheets to those sizes (grid layout: rows = animation states, columns = frames), load them
as atlases in `PreloadScene`, and delete the matching `make*` call. Packing them into a single
atlas at that point is also the moment to cut draw calls, which the current one-texture-per-
sprite approach doesn't do.

---

## Testing

```bash
npm test
```

runs three things:

1. **`tools/validate-level.mjs`** — the physics-aware level checks described above.
2. **`tools/smoke-test.mjs`** — boots the built game in headless Chromium at phone
   resolution, taps through the start screen, plays, opens and closes the pause menu, and
   fails on any console error, page exception or failed request. Screenshots land in
   `tools/shots/`.
3. **`tools/autoplay.mjs`** — stops Phaser's RAF loop and steps the *real* game frame by
   frame with a scripted bot that reads the tilemap ahead of itself and predicts creature
   positions (`Bat.predictY` / `Spider.predictY`). It plays the entire level in a few
   seconds, exercising streaming, pooling, checkpoints, respawns and the goal. Current
   result: reaches the win screen in ~70s of game time with no deaths, 155 crystals, and 36
   pooled objects covering all 288 entities in the level.

The autoplay bot is a traversal check, not a fun check — it says the level is completable
and nothing crashes, not that the timing feels good.

**Not yet done: playtesting on a real phone.** That's the next step per the build order, and
the thing that decides whether the jump constants are right.

### Two Arcade gotchas worth knowing

**Tile bias.** Falling at terminal velocity moves the body ~19px per physics step, which
exceeds Arcade's default `tileBias` of 16 — so a fast fall onto a ledge silently cancels
tile separation and the player drops through solid ground. It only reproduces on the
longest drops, which is exactly the kind of thing a short manual test misses. Fixed by
raising `tileBias` to 40 in the physics config.

**`touching.down` is not "on the ground".** Arcade runs the same separation maths for
`overlap` as it does for `collider`, so `GetOverlapY` sets `touching.down` on *any* body
that happens to be falling when it overlaps another one — crystals and checkpoints
included. Reading `blocked.down || touching.down` as the ground check therefore made
brushing a crystal on the way down count as a landing: it cleared the jump state, refilled
coyote time, and handed the player a real mid-air second jump for the next 140ms. A player
found it before the harness did; instrumenting an autoplay run then showed 85 airborne
frames per run flagged as grounded, up to 160px above the floor, and a tap on any of them
fired a full second jump 209 times out of 209. The ground check now reads `blocked.down`
only, which is the flag tile separation actually sets.

---

## Layout

```
index.html                  viewport/gesture locking, safe-area probe, rotate notice
src/main.js                 Phaser config + auto-pause wiring
src/config/tuning.js        every game-feel constant
src/scenes/                 Boot -> Preload -> Menu -> Game (+ Hud overlay) -> Win
src/objects/player.js       jump controller
src/objects/entities.js     hazards, creatures, pickups, markers (all pooled)
src/systems/director.js     entity streaming + pooling + checkpoint rewind
src/systems/parallax.js     three-layer background
src/systems/audio.js        Web Audio SFX + mobile unlock
src/systems/haptics.js      Capacitor Haptics
src/systems/lifecycle.js    gesture locking, safe areas, auto-pause
src/gfx/textures.js         procedural art (documented swap points)
src/level/level1.js         the hand-authored level
tools/                      asset builders, level validator, test harnesses
```

## Scope

Per the spec, this build intentionally has no second ability, no procedural generation, no
save system or leaderboard, no settings menu, no monetisation, and a constant scroll speed.
