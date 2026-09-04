# Working agreement

## Always confirm before making changes

**Check with me and get my confirmation before you start making any changes.** This applies
to everything: game code, level data, tuning constants, tooling, docs, commits, merges and
deploys. Investigating, measuring and reporting back is always fine and does not need
sign-off — the confirmation is required before anything is *edited*.

When I ask a question about the game ("why does X happen?", "can you check Y?"), that is a
request for an answer, not a request to fix it. Report what you found and what you propose,
then wait.

Present proposals as a short recommendation with the trade-offs, not a list of everything
possible. If a fix is obvious, still say what it is and wait for a yes.

## Notes on this project

- I play and test on a phone, from the deployed GitHub Pages build. I have no local dev
  environment, so "try it locally" is never a thing I can do. Changes only reach me when
  `main` is deployed.
- Development happens on `claude/game-build-spec-qi770o`. Deploys are triggered from `main`,
  which holds only the workflow: it builds two sites in one run — `/` from the `release`
  branch (the public URL, moves only when I say so) and `/preview/` from the development
  branch (where I test). So pushing the dev branch does **not** publish; the workflow has to
  be dispatched.
- The level is validated by physics, not by eye: `npm run validate` simulates the real jump
  arc. When a fairness bug turns up, prefer adding a rule that catches the whole class of it
  to fixing the one instance by hand.
- Before telling me a fix is ready to try, **check what the preview actually serves**. A
  deploy once ran 23 seconds after a commit, so it held the commit *before* the fix, and a
  whole day went by with me reporting a corner still broken while the build I was playing
  had none of the work in it. Pushing the dev branch is not deploying, and a green deploy is
  not proof it contains your commit — compare the run's timestamp against the commit's.
- `npm run lipcheck` checks rendered pixels for the straight-line class: every pit corner has
  art on it, no ruled rows on the platform face, pit walls ragged, panel seams bounded. It is
  **manual** — it needs a build plus a running preview server, and is not in `npm test` or
  CI. Worth running before a deploy that touches art or level geometry. Its real weakness:
  the face and seam checks sample a hardcoded spot (tile 300, lip row 14), so if the level
  changes there they measure the wrong pixels and pass regardless. Fix that before trusting
  it in CI. The corner-coverage check is the strong one — it reads corners from the tilemap,
  so a new pit with no art on it fails.
- **Any check of rendered pixels has to be shown to fail when the thing it guards is
  removed.** Three of the four ways the pit edge was measured were worthless, and one of them
  passed with the art deleted entirely. Two traps behind that, both hit for real: scanning
  for the topmost solid tile finds the *ceiling*, which is present in every column (walkable
  lips are gids 1 and 5, and getting this wrong reported 2 corners in the whole level); and
  `setVisible(false)` hides nothing, because the dressing culler sets `.visible` every frame
  from the camera window — use alpha to make a control group.
- Sound effects can be auditioned without deploying: `npm run sfx` renders any entry in
  `SOUNDS` to a WAV through the real synth (needs `npx vite` running). Candidates cannot be
  judged on a phone one deploy at a time, and it prints each render's peak, which is how the
  checkpoint got caught sitting 1.5dB under the biggest reward in the game.

## Keep my context window cheap

This is not a nicety. In one session two requests burned 44% of a five-hour window, and the
cause was not the work — it was tool output. Every request resends the whole transcript, so
anything large that lands in it is paid for again on every subsequent turn. A 60KB tool
result read once costs 60KB *per turn for the rest of the session*.

The rule: **filter before it reaches the transcript, not after.** A shell pipeline can
process megabytes for free; only what gets printed costs anything.

Specifics, in the order they actually cost me money:

- **Never poll CI with the GitHub MCP tools.** `actions_list` and `list_workflow_jobs`
  return the entire run or job object — 30-60KB of JSON to answer "is it green". Use
  `npm run ci` instead, which prints one line. `node tools/ci-status.mjs --watch` blocks
  until the run finishes and then prints that one line, which replaces the whole
  sleep-then-poll-then-parse dance. `--jobs` adds per-job detail, and it does that
  automatically when a run is red.
- **Batch deploys.** Every deploy is a trigger, a wait, and a verification. Three changes in
  one deploy cost a third of three deploys. Unless I have asked to test something right now,
  finish the batch first.
- **Read parts of files, not whole files.** `grep -n`, `sed -n '120,180p'`, `--head-limit`.
  Reading a 400-line file to change one function is the same waste in a smaller package.
- **Screenshots are expensive** and sometimes worth it — they settled the art and the
  animation when words could not. Earn them: crop to what is in question rather than
  full-frame, and take one, not four. A numeric measurement is usually cheaper *and* more
  convincing than a picture.
- **`npm test` and build output**: pipe through `grep -E` for the lines that matter. Never
  paste a full build log.
- **Probe scripts** written to disk, run once, and deleted are the right shape — but print a
  summary line, not the raw data you gathered. If the answer is "0 of 264 frames", say that,
  not the 264 frames.

Long commit messages are the deliberate exception. They are the project's memory, they are
written once, and they are never re-read into context — spend words there rather than in
chat.
