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
- Deploys go out from `main`; development happens on `claude/game-build-spec-qi770o`.
- The level is validated by physics, not by eye: `npm run validate` simulates the real jump
  arc. When a fairness bug turns up, prefer adding a rule that catches the whole class of it
  to fixing the one instance by hand.
