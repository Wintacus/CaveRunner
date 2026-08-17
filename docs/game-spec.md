# Cave Runner — Game Spec for Claude Code

## 1. Project Overview

Build a 2D side-scrolling auto-runner/platformer for mobile (iOS and Android), in the style of classic "jump pack" auto-runners (e.g., Rayman Jungle Run, Canabalt) rather than a free-roaming Mario-style platformer. The player character moves automatically from left to right at a constant speed; the player's only input is tapping/holding the screen to jump. The goal of this first build is **one complete, fully playable, hand-crafted level** set in a bioluminescent cave, built to a high standard of "game feel" from the start.

**This is a first playable build. Build it gray-box first (simple placeholder shapes/colors), confirm the core jump mechanic feels good on a real phone, and only then move to the art/sound pass.** Do not add scope beyond what's specified below — one complete, polished level is the goal, not multiple half-finished ones.

---

## 2. Core Concept & Theme

- **Genre:** 2D side-scrolling auto-runner/platformer (constant forward motion, player controls jump timing only)
- **Setting:** A cave system, rendered as a bioluminescent cavern — dark stone environment with glowing fungus/crystal color accents providing light and visual pop
- **Tone:** Careful, readable platforming — not twitch/reflex-heavy. The player should be able to learn the level's rhythm and "dance" through it on repeat attempts, in the tradition of Rayman Jungle Run.
- **Orientation:** Landscape only

---

## 3. Core Mechanics

### 3.1 Movement
- Character auto-scrolls left to right at a **constant, fixed speed** (not ramping, not variable by section) for this first build.
- **All movement must be calculated using delta time (elapsed time since the last frame), not a fixed per-frame amount.** This is critical: without it, the game will run at different effective speeds on different devices (e.g., a 120Hz phone screen vs. a 60Hz one), which would break the precise timing the whole level depends on. Cap delta time to a reasonable maximum so that resuming from a backgrounded/paused state doesn't cause objects to "teleport" forward.

### 3.2 Jump
- **Tap-and-hold = variable jump height.**
  - On tap/press-down: character launches upward immediately.
  - While held (up to a capped maximum, e.g. ~250-300ms — tune by feel), upward force continues to be applied, resulting in a higher jump.
  - On release, or upon hitting the max hold cap, upward boost ends and normal gravity takes over.
  - This produces one discrete jump per tap — not repeated flapping (this is not a Flappy Bird-style mechanic). A short tap = a small hop; a longer hold = a full jump. The character always returns to the ground in a normal arc.
- **Asymmetric gravity:** falling should be faster than rising (e.g., apply a gravity multiplier during the downward part of the arc) to avoid a "floaty" feeling and produce a snappier, more responsive jump.
- **Coyote time:** allow a jump to still register for a short grace window (~110-170ms) after the player's feet leave a platform edge.
- **Jump buffering:** if the player taps jump slightly before landing (~120-180ms window), remember that input and fire the jump the instant they touch down, rather than ignoring it.
- **Note for playtesting:** the tap-and-hold mechanic should be the first thing tested once a gray-box build is playable on a real phone. If it doesn't feel right, the fallback is a simpler fixed-height single-tap jump — this would be a small, isolated change, not a rebuild.

### 3.3 Collision & Hit Detection
- **Hitboxes should be slightly smaller than the visible sprite**, on both the player and hazards/creatures, so that visually-close near-misses don't count as hits (standard forgiveness practice).
- **Creatures (bats, cave worms/spiders):** avoid-only. Any contact from any direction counts as a hit. (Not a "jump on them to defeat" mechanic.)
- **Static hazards** (stalactites/stalagmites, spike clusters): contact counts as a hit.
- **Pits/gaps:** falling into one counts the same as a hit (triggers the same respawn/power-up-loss logic as touching a hazard).

### 3.4 Checkpoints, Power-Up & Death Handling
- The level contains **checkpoints** at defined points (see Section 5 for placement). On death, the player respawns at the most recent checkpoint, not the level start.
- **Power-up ("shield" pickup):** a mushroom-style pickup that, once collected, absorbs the next hit.
  - When a hit is absorbed by the power-up: **no knockback, no interruption** — the player simply keeps moving, and the power-up is consumed (removed).
  - Without an active power-up, a hit sends the player back to the last checkpoint.
- **Invincibility windows (~1-2 seconds each), applied in two situations:**
  1. Immediately after respawning at a checkpoint (prevents an unfair instant re-death if a hazard is close to the checkpoint).
  2. Immediately after the power-up absorbs a hit (prevents an unfair "double hit" from a second nearby hazard).
  - During either invincibility window, the character sprite should visually flash/flicker so the player can see they're temporarily safe.

---

## 4. Controls

- **Tap anywhere on the screen to jump** — do not use a small fixed on-screen button. This avoids the input-precision problems small touch targets create, and matches the proven approach used by comparable auto-runners.
- No other player-controlled inputs for this build (no left/right movement, no second ability). Keep v1 to jump-only; resist adding a second mechanic even if it seems easy to add — simplicity is the intended feel.
- A pause button should be present (see Section 7, UI Flow).

---

## 5. Level Design — Level 1 ("Cave Entrance")

One complete, hand-crafted (not procedurally generated) level, target playtime **~1-2 minutes**, structured in four segments separated by four checkpoints (segment 3, the densest, carries two):

**Segment 1 — Entrance (~15-20 sec)**
Teaches the jump. Simple gaps and one stalagmite obstacle. No creatures. Should be easy enough that a first-time player succeeds without difficulty — this segment exists purely to build confidence and let coyote time/jump buffering do their job invisibly.
→ **Checkpoint 1**

**Segment 2 — Bats Introduced (~20-25 sec)**
Introduces the first creature type (bats). Bats move in a **simple, readable, rhythmic** (not random) vertical pattern. Obstacles in this segment stay simple — only one new thing (creature timing) should be introduced at a time.
→ **Checkpoint 2**
→ **Power-up placed here** (a safety net banked right before the hardest section of the level)

**Segment 3 — Worms/Spiders + Combined Challenge (~25-30 sec)**
Introduces the second creature type (cave worms/spiders, also rhythmic vertical movement patterns). This segment combines static obstacles with both creature types together — this is the hardest section of the level.
→ **Checkpoint 3**

**Segment 4 — Finale (~15-20 sec)**
Remixes elements already taught — **do not introduce new mechanics or creature behaviors here.** Arrange already-known obstacles/creatures into the most visually dramatic/exciting combination in the level as a satisfying closer, then a clear, unobstructed run to a visible level-end marker.

**General level design principles to apply throughout:**
- **Telegraph everything.** Any obstacle or creature behavior the player must react to needs a visible cue *before* it becomes dangerous (a wind-up animation, a brief pause, a glow) — deaths should always feel like "I should have seen that," never "that was unfair."
- **Never use color alone to signal danger.** Pair any color-based cue with a shape, motion, or animation change too, so the game reads clearly for colorblind players.
- **Easy on-ramp.** The earliest obstacles in the level should be the most forgiving.
- **Breathing room.** Alternate tense obstacle/creature clusters with short calmer stretches — difficulty should have a rhythm, not be relentless.

---

## 6. Collectibles & Scoring

- Simple glowing crystal pickups scattered through the level (fits the bioluminescent theme).
- Collecting crystals adds to a simple score counter, visible during play.
- No persistence/save system and no leaderboard needed for this build — score exists only within a single playthrough.

---

## 7. UI Flow

Required screens/elements for this build:
1. **Start screen** — tap to begin (this tap also unlocks audio — see Section 8)
2. **Gameplay** with a **pause button** visible at all times, positioned with safe-area padding (see Section 11.2)
3. **Death/respawn** handling (as described in Section 3.4) — no separate "game over" screen needed unless the player wants to restart the whole level; respawn should feel fast and low-friction
4. **Win screen** upon reaching the level-end marker

No settings menu, no account system, no save/leaderboard UI needed for v1.

---

## 8. Audio Design

- **General principle:** sound feedback should be clear, short, immediately identifiable, and not fatiguing when heard repeatedly (the jump sound especially, since it will play many times per run).
- **Jump sound:** build as two distinct layered sounds — a quick "push-off" sound triggered on tap/press-down, and a separate landing-impact sound triggered on touchdown.
- **Other suggested sound events:** checkpoint reached, power-up collected, crystal collected, hit/death, level complete.
- **Mobile audio unlock requirement:** mobile browsers/WebViews block audio autoplay until the user interacts with the page. Initialize/load audio without playing it, and trigger the first sound playback (and resume the audio context) directly inside the Start screen's tap handler, since that's the guaranteed first user gesture.
- Sound effects can be sourced from free, ready-to-use libraries (e.g., Pixabay, OpenGameArt, itch.io asset packs) rather than necessarily generated — many cave/platformer-appropriate sound packs already exist and are simpler to license than generating audio.

---

## 9. Haptic Feedback

Include haptic (vibration) feedback via Capacitor's Haptics plugin, used sparingly and only for meaningful moments — not on every jump (which would create constant background buzz rather than useful signal):

- **Hit/death:** a sharp, distinct impact buzz
- **Checkpoint reached:** a light, positive confirmation tap
- **Power-up collected:** a light, positive tap, distinct from the checkpoint one
- **Level complete:** a stronger, satisfying buzz as part of the win celebration

Do not add haptics to jump takeoff/landing or crystal collection for this build — these happen too frequently and would create noise rather than signal. (Easy to expand later if it feels too sparse in testing.)

---

## 10. Visual Style & Art Pipeline

### 10.1 Look
- Dark stone cave environment with glowing bioluminescent fungus/crystal accents providing color and light.
- Implement a **parallax scrolling background** with 2-3 depth layers (e.g., distant cave wall, mid-ground rock formations, foreground details) scrolling at different speeds relative to the camera, to create an illusion of depth. This is a well-established, low-effort/high-payoff technique in Phaser (via `setScrollFactor()`).

### 10.2 Art Asset Pipeline (AI-generated sprites)
Art assets will be AI-generated. For assets to drop cleanly into Phaser without conversion work, generated sprites should meet these specs:
- **Transparent background PNG** (not a solid color background)
- **Grid-based sprite sheets** — rows represent different animation states (e.g., idle, jump, fly), columns represent frames within that animation (a common convention is a 4×4 grid, but this can vary by asset)
- **Character consistency across frames** is the trickiest part of AI sprite generation in practice — this is worth checking for specifically when choosing which AI tool/generator to use, since quality varies significantly between tools on this point.
- Build with gray-box placeholder shapes first; swap in generated art only after the core mechanics are confirmed to feel good.

---

## 11. Technical Architecture

### 11.1 Stack
- **Game framework:** Phaser 3
- **Physics system:** **Arcade Physics** (not Matter.js) — Arcade Physics is Phaser's lightweight system built specifically for simple platformers with rectangle/circle collision shapes, which is exactly what this game needs. Matter.js is a heavier full-body physics simulation system that would add unnecessary complexity here.
- **Level layout tool:** Tiled (free visual map editor) — build the level as a Tiled map and load it into Phaser, rather than hand-coding tile positions. This allows for much faster visual iteration on level layout.
- **Mobile wrapping:** Capacitor, to package the Phaser/HTML5 game as a native iOS and Android app without rewriting game code.
- **Scene structure:** follow Phaser's standard convention — Boot scene → Preload scene (with loading progress) → Menu scene → Game scene → GameOver/Win scene.

### 11.2 Mobile-Specific Requirements
These are not optional polish — they prevent the game from feeling broken or being literally unplayable in certain moments on a real phone:

- **Viewport & gesture locking:** Set a viewport meta tag that disables pinch-zoom and double-tap-zoom. Disable text selection and touch callouts via CSS. Prevent pull-to-refresh and other accidental browser gestures from firing during gameplay (particularly important since players will be tapping/holding rapidly near the top of the screen, which is exactly where accidental "swipe down to exit fullscreen" or "pull to refresh" gestures tend to trigger).
- **Safe-area handling for landscape orientation specifically:** since the game is landscape-only, and a phone's notch/Dynamic Island shifts to the *side* of the screen in landscape (not the top), use CSS safe-area-inset environment variables to keep the pause button and score UI clear of the notch. As an extra precaution, keep all interactive UI elements at least a small buffer (e.g., 20px) away from every screen edge, since some devices have touch dead zones near the edges in landscape that aren't reported by the safe-area system at all.
- **Auto-pause on backgrounding:** use Capacitor's App API to detect when the app is sent to the background (e.g., a call comes in, or the player switches apps) and immediately pause the game loop and audio. Resume cleanly when the app returns to the foreground.
- **Audio unlock:** see Section 8.

### 11.3 Performance
- **Object pooling:** reuse/recycle obstacle and creature game objects rather than constantly creating and destroying them, to reduce garbage collection overhead.
- **Sprite atlases:** combine sprites efficiently to reduce draw calls.
- **Test on a real physical device regularly during development** — do not rely solely on desktop browser testing, since mobile performance and touch feel can differ substantially from desktop.

---

## 12. Accessibility Notes

- Never communicate danger or important information through color alone — always pair color cues with a shape, motion, or animation difference (relevant especially to creature telegraphing, per Section 5).

---

## 13. Deployment Notes (For Later — Not a Build-Time Concern)

Flagging for awareness, not action right now: when this game is eventually submitted to the **Apple App Store**, be aware that certain common Capacitor plugins (e.g., filesystem, preferences/local storage) require an iOS "Privacy Manifest" file (`PrivacyInfo.xcprivacy`) declaring why the app uses certain APIs. This is a standard, well-documented submission requirement — not a bug, and not something to build or worry about now — but worth knowing about ahead of time so it doesn't cause confusion at submission time.

---

## 14. Explicit Non-Goals for This Build

To keep scope disciplined, the following are **intentionally excluded** from this first build:
- Multiple levels (this spec covers exactly one complete level)
- A second player ability/control beyond jump (e.g., no float, dash, or duck)
- Endless/procedural level generation
- Save system, leaderboards, or persistent progress
- Settings menu (sound toggle, etc.)
- Monetization (ads, in-app purchases)
- Variable/ramping scroll speed (fixed constant speed only, for this build)

---

## 15. Suggested Build Order

1. Set up the Phaser 3 + Capacitor project scaffold with the standard scene structure.
2. Build the core player controller: movement, tap-and-hold jump, coyote time, jump buffering, asymmetric gravity — using delta-time-based movement from the start.
3. Build with **gray-box placeholders** (simple rectangles/shapes) for the player, obstacles, and creatures.
4. Build the Level 1 layout in Tiled per the four-segment structure in Section 5, including checkpoints and the power-up.
5. Implement collision/hit/respawn/invincibility logic per Section 3.
6. **Test on a real phone.** Confirm the jump feel, coyote time, and buffering feel right before proceeding. Adjust tuning values as needed.
7. Add mobile-specific requirements (Section 11.2): viewport/gesture locking, safe-area handling, auto-pause, audio unlock.
8. Add haptics (Section 9).
9. Swap in AI-generated art assets and parallax background (Section 10).
10. Add sound design (Section 8).
11. Final playtest pass on a real device, checking UI flow (Section 7) end to end.

---

*This spec reflects a full round of research and design discussion covering platformer game-feel principles (coyote time, jump buffering, asymmetric gravity), genre precedent (Rayman Jungle Run, Canabalt), mobile-web technical requirements, accessibility, sound design, and AI art asset pipelines. It's intended to be handed directly to Claude Code as a project brief.*
