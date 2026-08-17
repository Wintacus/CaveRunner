# Cave Runner — context for a chat session

Paste or upload this at the start of a conversation about Cave Runner. It is a snapshot of
what the game is, how it is tuned, and the rules it is built to, so a discussion can start
from facts instead of guesses.

**What you can and cannot do with this.** You do not have the repository. You cannot edit
files, run the build, or run the level validator, and you should not pretend otherwise.
What this file supports well is design and balance discussion, explaining trade-offs,
diagnosing described symptoms, and drafting changes precisely enough that they can be
handed to a coding agent that does have the repo. If a question needs the actual source,
say so rather than inventing it.

**How the owner likes to work** (this matters, it is a standing instruction in the repo):
check and confirm before proposing that anything be changed. Investigating, measuring and
reporting back is always welcome; a question about the game is a request for an answer, not
a request for a fix. Present proposals as a short recommendation with trade-offs, not an
exhaustive list of options.

---

## 1. What it is

A 2D side-scrolling auto-runner set in a bioluminescent cave. The runner moves right at a
constant speed and the only input is **tap to jump**, with tap-and-hold giving a higher
jump. One complete hand-crafted level of about 70 seconds.

- **Status:** vertical slice — one complete slice of the intended experience at shippable
  quality, rather than a rough prototype. Version `0.1.0`.
- **Stack:** Phaser 3.90 with Arcade Physics, a real Tiled `.tmj` level, Vite for the web
  build, Capacitor configured for iOS/Android (native projects not committed).
- **Deployed:** GitHub Pages at `https://wintacus.github.io/CaveRunner/`, published from
  `main` by a GitHub Actions workflow. Development happens on a feature branch and is
  merged to `main` to release.
- **Testing reality:** the owner plays on a phone, from the deployed build, and has no local
  development environment. "Try it locally" is never an option for them. Changes only reach
  them when `main` is deployed.

Two debug flags are live in the deployed build: `?debug=1` draws Arcade physics bodies plus
a haptics readout, and `?perf=1` shows an fps / frame-time / renderer readout.

---

## 2. Controls and feel

Tap anywhere to jump — no on-screen button, because small touch targets are the input
precision problem this genre learned to avoid. Holding the tap jumps higher, up to a cap.

| | |
|---|---|
| Bare tap | ~92px high, ~192px of ground covered |
| Full hold (270ms) | ~190px high, ~314px of flat reach |

The controller also implements **coyote time** (a jump still fires shortly after running off
an edge), **jump buffering** (a tap just before landing fires on touchdown), and
**asymmetric gravity** (falling is 1.7× rising, so the arc lands snappy instead of floaty).

Forgiveness is deliberate and asymmetric: the player's hitbox is 20×34 inside a 30×42
sprite, and hazard bodies are similarly inset, so near misses look near rather than fatal.
Pickups go the other way — their hitboxes are slightly *larger* than the art, because a
crystal that looks collected should count.

### The tuning constants

Everything that decides how the game feels is in `src/config/tuning.js`. Verbatim:

```js
// Movement
RUN_SPEED = 370          // px/s, constant. 300 -> 330 -> 370 over two device tests.
MAX_DELTA_MS = 50        // delta cap; a 20fps floor for resuming from background

// Jump — tap-and-hold, variable height, asymmetric gravity
JUMP_IMPULSE = 560       // instant upward velocity on press-down
HOLD_FORCE = 1500        // extra upward acceleration while held
HOLD_MAX_MS = 270        // hold cap; past this the boost ends even if held
GRAVITY_RISE = 1900
GRAVITY_FALL = 3300      // 1.7x rise
MAX_FALL_SPEED = 1150
COYOTE_MS = 140          // grace after running off an edge
JUMP_BUFFER_MS = 150     // pre-landing tap window

// Player body
PLAYER_SPRITE_W = 30, PLAYER_SPRITE_H = 42
PLAYER_BODY_W = 20, PLAYER_BODY_H = 34

// Damage / respawn
RESPAWN_INVULN_MS = 1600, SHIELD_INVULN_MS = 1400, RESPAWN_DELAY_MS = 480

// Creature cycles, as fractions of each creature's period
BAT_HOLD = 0.18, BAT_MOVE = 0.32          // parked, travelling, parked, travelling
SPIDER_WINDUP = 0.28, SPIDER_DROP = 0.18, SPIDER_HANG = 0.3   // remainder is the retract

// Camera
CAMERA_LEAD = 300        // runner sits this far from the left edge
CAMERA_LERP_Y = 0.08

// Streaming
ACTIVATION_MARGIN = 260  // entities wake this far past the camera's right edge
RECYCLE_MARGIN = 220
CRYSTAL_SCORE = 10
```

**A relationship that catches people out:** jump *height* comes from gravity alone, so it
does not move with run speed — but *reach* is speed × airtime, so it scales directly. Raise
`RUN_SPEED` and every pit gets easier unless the pits widen with it. This is why the pits
are 4–6 tiles at 370px/s where they were 3–5 at 330.

**Reaction budget:** the runner is drawn 300px from the left edge of a 960px-wide design
space, so 660px of track is visible ahead — 1.8s at the current speed. That is the number
that constrains further speed increases; past roughly 400px/s the camera lead would need to
grow with it.

---

## 3. The level

850×18 tiles, 32px each. The walkable floor surface is row 14; the ceiling occupies rows
0–1. Total run is ~70 seconds, spawn to goal, split by four checkpoints.

| Segment | Tiles | Time | Introduces |
|---|---|---|---|
| 1 — Entrance | 0–168 | ~15s | The jump. Widening gaps, stalagmites, no creatures. |
| 2 — Bats | 168–393 | ~20s | Bats. Terrain stays simple; creature timing is the new idea. |
| 3 — Spiders + combined | 393–655 | ~23s | Ceiling spiders, then everything at once. Hardest stretch. |
| 4 — Finale | 655–812 | ~15s | Remix only: a staircase of lit ledges over open pits, then a clear run to the goal. |

Checkpoints at tiles 166, 376 and 648. The one shield power-up is at tile 386, immediately
after checkpoint 2 and immediately before the hardest section. Goal at tile 812.

**Contents:** 246 crystals, 15 bats, 9 spiders, 12 static hazards (8 stalagmites, a 3-tile
spike run, 1 stalactite), 4 checkpoints, 1 power-up, 1 goal, 2 instruction signs and the
spawn point — 291 objects in the compiled map.

**Pacing**, measured by `npm run pacing`, which counts beats demanding an input and the dead
air between them:

- One beat every 1.17s across the level
- **No lull longer than 2.5s anywhere** (it was 36% of the run before the first pacing pass)
- Per segment: Entrance one every 1.8s, Bats 1.2s, Spiders 1.0s, Finale 1.2s

The calm beat immediately after each checkpoint is deliberate and protected — that is where
a player recovers after a respawn.

**Death and respawn:** a hit without the shield sends you to the last checkpoint with 1.6s
of invincibility. Falling in a pit costs the same. The shield absorbs one hit with no
knockback and no interruption — you keep running — and is worn visibly as a spinning ring
around the runner rather than as a HUD icon.

---

## 4. Creatures

Both types are avoid-only: contact from any direction is a hit. Both move on a readable
rhythmic pattern, never randomly. Every cue is shape and motion rather than colour, so it
reads for colourblind players.

**Bats** sweep vertically and pause at each extreme. Before leaving an extreme they spread
their wings wide, swell, and lean the way they are about to travel.

**Spiders** hang from the ceiling and drop on a beat: wind-up (legs spread, body shaking,
silk taut), then the drop, a hang, then a slow retract. A `hang` property lets a spider rest
*partway down* instead of at the ceiling — the silk still runs to the ceiling, only the
resting height moves.

### The design rule that matters

The runner's x position at any instant is fixed by the constant scroll speed. **The player
cannot change where they are, only how high.** So every creature encounter has exactly two
possible answers — pass under it, or jump over it — and the creature must have settled on
one of them before the player arrives. A creature that changes state *while* the player
crosses it answers both at once and cannot be beaten by paying attention, only by already
knowing. This is the single most important constraint on creature timing.

Consequently every creature is deliberately timed to present one of three things:

- **Blocking** — on the floor, jump it
- **Dangling / low** — occupying a band of air, stay on the ground
- **Climbing away** — low enough to read as an obstacle at the moment it has stopped being
  one, so the instinct to jump is the wrong answer (a deliberate fake-out)

Current distribution: of 9 spiders, 5 block, 2 dangle at head height, 2 climb away. Of 15
bats, 10 block and 5 climb away. **None are idle** — an earlier build had 4 spiders and 11
bats that the player simply ran under, which read as stale.

The climbing fake-outs have a nuance worth knowing: measured in the real game, running
straight through is clean, a *tap* is a hit, and a full hold clears over the top. What gets
punished is the hesitant hop, not commitment.

**Creature timing is deterministic relative to the player's approach.** A creature winds its
clock back by the journey the runner still has to make, so it is at the same point in its
cycle when the player arrives — from any distance and on any approach, including after a
respawn at a nearby checkpoint. The beat learned on attempt 3 is the beat you get on
attempt 30.

---

## 5. How correctness is decided

This is unusual and any advice that ignores it will be wrong: **the level is validated by
physics simulation, not by eye.** `npm run validate` simulates the real jump arc from the
tuning constants and refuses to compile a map that fails. Change `RUN_SPEED` or any jump
constant and every gap in the level is re-checked against the new reach.

The rules it enforces:

- Every pit checked against real reach for its width *and* its step up or down; a warning
  under 20% margin
- Entities buried in rock, floating over pits, or at the wrong surface height
- **Creature reach** — a bat at the bottom of its sweep or a spider at full extension must
  actually intersect a runner standing below it, or it is a decorative threat. It must also
  not reach *through* that surface. Measured against the surface under the creature, not a
  global floor row, since a creature over a ledge can be well above row 14 and still buried
  in the slab it flies over
- **Anything hoppable, too close to a pit lip** — hopping commits you to a fixed arc, so if
  the next lip is nearer than the shortest possible hop, the hop itself lands in the pit
- **Creatures that move in or out of the lane mid-crossing** (see the design rule above)
- **Spider settle time** — a spider that is down when the player arrives must have landed at
  least 400ms earlier. "Not mid-drop" is a weaker promise than it sounds: one landing 94ms
  before the crossing passes that check and is still, in play, a spider arriving on your head
- **Dangling spiders** — enough headroom to run under, low enough to matter, never in the
  flight path of a jump the player has no choice about, never within one hop of a ground
  hazard
- **Bat clearance** — a bat meant to be run under must leave at least 20px of daylight;
  below that it is a graze rather than a designed near miss
- Checkpoint, power-up and goal counts, plus a pacing report per segment

There is also a headless smoke test (boots the real game in Chromium, fails on any console
error, and asserts that all four markers are impossible to jump over and that all 23 sprite
sizes match their textures) and a full autoplay run (a scripted bot that plays the entire
level frame by frame; currently wins in 69.7s with no deaths).

**The limit of all this:** the bot predicts creature positions perfectly, so its zero deaths
means "completable", never "fair" and never "fun". Every genuinely interesting bug in this
project was found by a human playing on a phone, not by the suite.

---

## 6. Architecture

```
index.html                        viewport/gesture locking, safe-area probe, rotate notice
src/main.js                       Phaser config + auto-pause wiring
src/config/tuning.js              every game-feel constant
src/scenes/                       Boot -> Preload -> Menu -> Game (+ Hud overlay) -> Win
src/objects/player.js             the jump controller
src/objects/entities.js           hazards, creatures, pickups, markers (all pooled)
src/systems/director.js           entity streaming + pooling + checkpoint rewind
src/systems/parallax.js           three-layer background
src/systems/audio.js              Web Audio SFX, synthesised, no files
src/systems/haptics.js            Capacitor Haptics
src/systems/lifecycle.js          gesture locking, safe areas, auto-pause, viewport fit
src/physics/jump-model.js         the jump arc, shared by game and validator
src/physics/creature-motion.js    bat and spider motion, shared the same way
src/gfx/textures.js               procedural art, generated at boot
src/level/level1.js               the hand-authored level
tools/                            asset builders, level validator, test harnesses
```

Two structural ideas worth knowing:

**Shared physics models.** `jump-model.js` and `creature-motion.js` are Phaser-free so the
validator can import the *same* code the game runs. This exists because the alternative
failed in practice: the validator once kept its own copy of the spider's motion and the two
drifted — the game eased the retract on a cosine curve while the validator used a quadratic
one, disagreeing by about 10px. Checks that decide fairness are measured in tens of pixels,
so that mattered.

**Everything is procedural.** All sprites, the parallax layers and the tileset are drawn to
canvas at boot; the sound effects are synthesised through Web Audio. There are no binary
art or audio assets. `SPRITE_SIZES` in `textures.js` is populated as the textures are drawn
and gives the size a replacement PNG would need to be.

---

## 7. Constraints

From the original spec, deliberately excluded from this build:

- Multiple levels — this is exactly one complete level
- **A second ability beyond jump** — no float, dash, double jump or duck
- Endless or procedural generation
- Save system, leaderboards, persistent progress
- Settings menu
- Monetisation
- **Variable or ramping scroll speed** — constant only

The first and last of these are load-bearing for everything else. One button and one
constant speed is why creature timing has to be deterministic, and why "the player cannot
change where they are, only how high" is the design rule the whole level obeys. Suggestions
that quietly assume a second input or a speed change are not small changes; they invalidate
the level's fairness guarantees.

---

## 8. Known open items

- **An unreproduced frame-rate dip.** The owner saw a bad slowdown once. Measured on their
  device afterwards it was a solid 61fps everywhere with no dropped frames, and three deploys
  benchmarked head to head showed identical frame cost. `?perf=1` is deployed to catch it if
  it returns. Worth knowing: Phaser is configured with `fps: { min: 30, smoothStep: true }`,
  which clamps the delta given to the simulation — so a device slower than 30fps runs in
  *slow motion* rather than dropping frames, which looks like a completely different bug.
- **Haptics are dead code on iOS Safari**, which has no Vibration API. They only do anything
  in a native Capacitor build. Undecided whether to keep them.
- **Native projects are not committed.** Capacitor is configured but `npx cap add ios|android`
  has never been run. App Store submission would eventually need a `PrivacyInfo.xcprivacy`
  privacy manifest.
- **Draw calls are not batched.** Every sprite has its own generated texture, so nothing
  batches. Packing them into one atlas is the known optimisation if performance ever becomes
  a real constraint; it has not been needed so far.

---

## 9. If you are asked to change something

The owner will usually be relaying a *feeling* — "it floats", "the bats are boring", "that
spider drops on my head". Every one of those in this project turned out to have a specific,
measurable cause, and guessing at it produced worse answers than measuring did. Useful
questions to ask: where in the level, on which approach, and does it happen every time or
only sometimes.

When proposing a change, be concrete about which constant or which entity, and say what the
trade-off is. Prefer a rule that catches a whole class of problem over a fix to a single
instance — that is the established habit in this project, and the validator is where those
rules live.
