# Working agreement

**Ship changes all the way through.** When Jake asks for a change, don't stop at
a pushed branch: carry it to the end without being asked again — build it, check
it actually works (drive the real app, not just the tests), commit, push, open
the pull request, and merge it into `main` so the deployed app picks it up. Only
pause for a question if the change is genuinely ambiguous or risky.

## Conventions

- **Branch, don't push to `main` directly.** Work on a feature branch, then merge
  it via a pull request.
- **Bump `version.json`** on every user-facing change, using a `YYYY.MM.DD.N`
  stamp (`N` counts that day's releases). The client polls this file and offers
  "Update now" when it changes, so skipping the bump means players stay on the
  old build.
- **Update the README** when behaviour players can see changes — the
  "How to play" sections are the manual.
- **Verify in the running app.** `npm run dev` serves the client on :5173 and
  the game server on :3001; reach it at `http://localhost:5173` (not
  `127.0.0.1`, which the server's CORS list rejects). A headless browser can
  create a room, add a bot and start a game to check a change on a real board.
- **Lint is not clean on `main`** (a few pre-existing `react-hooks` errors).
  Compare against the baseline rather than chasing them.
- **Card visuals use a multi-layer `background`** for the gradient border
  (`body padding-box, border-gradient border-box`). A plain colour is only legal
  in the *last* layer of that shorthand, and one anywhere else silently voids the
  whole declaration and leaves the card see-through — so wrap a flat body colour
  as `linear-gradient(colour, colour)`. Check `getComputedStyle(el)
  .backgroundImage` when a card looks wrong; `none` means the declaration was
  dropped.
