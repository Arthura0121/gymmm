# GRINDSET — Workout Tracker

A two-panel workout tracker. One **rep** = one full set (e.g. 30 pushups).
You press **Log Rep** once per set; a real rest countdown starts automatically
and ends in a loud alarm. Reps, pushups-per-rep, and rest length are all
adjustable right in the app — no code editing needed.

- **`me.html`** — your panel. PIN-locked (default `7734`). Start/pause/reset,
  the settings gear (⚙) to change the plan, and a low-key **Manual Adjust**
  section for nudging the rep count up or down.
- **`dad.html`** — spectator panel. Read-only, no adjust controls, no way to
  tell they exist. Share this link with your dad.

## How a rep works

1. Tap **START**.
2. Do your set (e.g. 30 pushups).
3. Tap **LOG REP**. A real rest countdown starts immediately (default 45s).
4. When it hits zero, a loud alarm plays and the button flips back to
   **LOG REP** for the next one.
5. Repeat until all reps are done.

Adjusting reps recalculates elapsed time using your real average time-per-rep
(plus a full rest for every rest period it skips over), so the total-time
clock on both panels always matches the rep count — nudge it and the timer
jumps too.

## Changing the numbers

Tap the ⚙ gear on your panel (top right). Set:
- **Number of reps** (sets) — default 24
- **Pushups per rep** — default 30 (this is just a label; it doesn't affect
  timing, only what's displayed)
- **Rest between reps (seconds)** — default 45

Saving resets the current workout on both panels (there's a confirmation if
one's in progress).

## 1. Run it locally

Just open `index.html` in a browser — no build step. On one device/browser,
`me.html` and `dad.html` sync live between tabs automatically (via
`localStorage`).

## 2. Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "grindset tracker"
git branch -M main
git remote add origin https://github.com/<you>/grindset.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Deploy from branch → `main` / root**.
Your app will be live at `https://<you>.github.io/grindset/`.

Send yourself `.../me.html` and your dad `.../dad.html`.

## 3. Cross-device sync (optional but recommended)

By default, syncing uses `localStorage`, which **only works between tabs on
the same browser/device** — great for testing, not for "my phone, his phone."

For real cross-device live sync:

1. Go to [Firebase console](https://console.firebase.google.com) → create a
   free project.
2. Build → Realtime Database → Create database → start in **test mode**.
3. Project settings → your apps → add a **web app** → copy the config object.
4. Paste those values into `js/firebase-config.js`.
5. Commit and push. Both panels will now update instantly across devices.

(Test mode leaves the database open to anyone with the URL — fine for a
personal fitness tracker, but don't put anything sensitive in it.)

## 4. Changing the PIN

`me.html` defaults to PIN **`7734`**. To set your own, open the browser
console on `me.html` once and run:

```js
localStorage.setItem('grindset_pin', '1234'); // your new PIN
```

That's stored per-device, so set it separately on each device you use.

## Sound

A loud 3-beep alarm plays the instant a rest period ends (on both panels,
independently). A softer fanfare plays when the whole workout is done.
Browsers block audio until the page has been tapped at least once — `me.html`
unlocks it automatically the first time you enter your PIN; `dad.html` shows
a one-time "tap to enable sound" button.

## How the manual adjust (cheat) math works

- Every genuine rep tap records how long that set actually took. The last
  ~40 taps are averaged into your pace.
- **Adding** N reps fast-forwards the clock by `N × your average pace`, plus
  one full rest period for every rest the jump skips over — including the
  one you're currently sitting in if you cheat again mid-rest.
- **Removing** N reps unwinds the same math in reverse.
- Before you've done a single real rep, it estimates ~0.8s per pushup as a
  starting guess (e.g. ~24s for a 30-pushup rep), then switches to your real
  average as soon as you log one.

This logic has been fuzz-tested against tens of thousands of random
add/remove/pause/start sequences to make sure the clock never goes negative
or gets stuck.
