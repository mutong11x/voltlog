# VOLTLOG — working notes for Claude Code

Mobile-first web app for logging gym workouts and tracking Evolt 360 body-composition scans.
Single user, single file.

## Hard constraints

**The entire app is `index.html`** — HTML + CSS + JS in one file, no build step, no framework, no
backend. Editing it and committing is the whole deploy: GitHub Pages redeploys `main` in ~1 min.

Do **not** introduce a build system, framework, bundler, package.json, or backend unless a task
explicitly asks for it. Do not add abstractions the current scale doesn't need. Favour the
simplest change that fits the patterns already there.

External deps are two CDN scripts (Chart.js 4.4.1, pdf.js 3.11.174) and Google Fonts. The app is
therefore **not offline-capable**, which is a known and accepted gap.

## Layout of the file

1. `<head>` — meta (incl. `viewport-fit=cover` + Apple PWA tags), fonts, CDN scripts, then one
   large `<style>` block. Dark "bioscan" theme, CSS variables on `:root`.
2. `<body>` — four views (`#v-log`, `#v-hist`, `#v-body`, `#v-dash`), header, bottom nav, FAB, and
   modals (`#exModal` add-exercise, `#libModal` exercise library, `#moreModal` settings,
   `#scanModal` scan review, `#toast`).
3. `<script>` — commented sections: DATA LAYER, HELPERS, LOG VIEW, HISTORY, PDF EXTRACTION,
   BODY VIEW, DASHBOARD, CHART HELPERS, NAV / MODALS, INIT.

## Persistence

`sget`/`sset` pick the first available of: `window.storage` (inside Claude) → `localStorage`
(prefix `voltlog:`) → in-memory. All values JSON. Five keys: `branches`, `exercises`, `sessions`,
`scans`, `settings`, each persisted by a `save.<key>()` helper.

This two-function isolation is deliberate — it's the seam a future Supabase layer plugs into.

## The three data rules

These are the load-bearing decisions. Breaking them causes silent, hard-to-find wrongness.

**1. Derive metrics on read; store only what was logged.** Sets are the facts. Volume
(`entryVol`) and PRs (`prMap`) are computed every render, never persisted. Storing a derived
value creates a second source of truth that drifts — PRs used to be stored in a `prs` array and
were wrong for exactly that reason. If you add a metric, add a function, not a field.

**2. Semantics are snapshotted onto the session entry.** `name`, `cat` and `load` are copied onto
the entry at save time, so editing an exercise later never rewrites what past sessions mean.
`loadSessionToDraft` reads `load` from the **entry**, not the library — re-saving an old session
must not re-stamp it. `load` is the one that genuinely changes meaning (it moves volume numbers),
so the only way to change it on history is the explicit, opt-in "recalculate past sessions" in
the Exercise Library. `rev` is the exception that proves the rule: it moves volume the way `load`
does, but it describes the *movement* rather than the day — an assisted pull-up was always
assisted — so `setReverse` writes it back through history behind a confirm instead of waiting for
that checkbox.

**3. `name` and `cat` are labels, and labels backfill.** Both are identity, not a record of what
happened that day, so editing either in the library propagates **backwards** through stored
entries — `renameExercise` and `recategorize`, both confirmed with a session count. A
library-only rename would split one lift into two progress series (`exNames`, `exSessions` and
`prMap` all key off trimmed lowercase entry name); a library-only re-category would leave past
volume stacked under the old body part in `renderVolChart`, which reads `entry.cat`. Neither
changes a single number. Two exercises may never share a name; collisions are rejected.

## Metric definitions

- **Volume** = `Σ (weight × reps)`, scaled by `loadMult`: **× 2 when `entry.load === "side"`**,
  **× 0 when `entry.rev`**. One implementation only: `entryVol`. Four callers: `renderHistory`,
  `renderWeekStats`, `exSessions`, `renderVolChart`. Never re-inline the formula.
- **`load`** — `"std"` (×1) or `"side"` (one-limb-at-a-time, ×2). Affects **volume only**: top-set
  weight, `e1rm`, PRs and set counts are never multiplied. A per-side set is logged once and
  counts as one set. Two-dumbbell both-arms lifts are `"std"`. Missing `load` reads as `"std"`.
- **`rev`** — reverse-loaded work (assisted pull-up, assisted dip), read with `isRev`. The logged
  number is *assistance*, so less of it is harder. It is **excluded** from volume (`loadMult`
  returns 0), not inverted: inverting would need an arbitrary baseline, and counting it as-is
  rewards getting weaker. `rev` also flips every ranking that reads weight — PRs go to the
  **lowest**, `top` renders as "Least assist" — and hides est. 1RM and Volume on the dashboard,
  since Epley assumes more weight is harder. Missing `rev` reads as false; `rev` beats `load`.
- **est. 1RM** — Epley, `weight * (1 + reps/30)` (`e1rm`). Returns 0 without a weight.
- **Best set of a session** — `setPills` renders the pills *and* decides which one is best, so the
  Stats per-exercise log and the last-time band on the log card can never disagree. Like
  `entryVol`, one implementation: don't re-inline it. It renders a weight of `0` as `0`, not `–`,
  because for a `rev` lift zero assistance is the achievement.
- **PRs** — derived by `prMap()`: one chronological pass (date, then id) keeping a running best
  per exercise, so a PR means "beat everything logged *before* this session". Entries are pooled
  per exercise within a session. For a `rev` exercise the record is the **lowest** weight
  (`kind:'Assist'`) and no 1RM or Weight PR ever fires; 0 kg counts, because zero assistance is
  the goal rather than a blank — which is why the minimum is tracked with `num()`/`minOf` instead
  of the `||0` the maxima use. A first-ever appearance emits a `news` marker (blue `New` badge),
  not a PR; a PR also requires a non-zero load, so bodyweight lifts only ever show `New`. Read
  with `prsFor(map, sessionId)`.

## Migrations

`migrateLibrary()` runs on load and after a JSON import (a backup can predate the current
version). Bump `LIB_VER` and add a **guarded block** — `if(from < N){ ... }` — so installs never
re-run earlier steps. Currently at 5: v2 split the deadlift variants, v3 added `load` to the
library, v4 deleted the stored `prs` arrays, v5 resynced entry `cat` to the library. If a
migration touches sessions, make sure the `loadDB` call site persists them.

Migrating **input** data (like `load`) retroactively needs explicit user consent; migrating
**derived** data (like `prs`) does not, because it's recomputable. A pure **label** (like `cat`)
doesn't either — nothing it touches is a number.

## Checking your work

There is no test suite and no linter. At minimum, syntax-check the inline script:

```bash
python3 -c "import re;print(re.findall(r'<script>(.*?)</script>',open('index.html').read(),re.S)[-1])" > /tmp/app.js
node --check /tmp/app.js
```

Beyond that, the productive pattern is to extract the real function from `index.html` with a
regex, `eval` it against stubs in Node, and assert behaviour — and for anything user-visible, load
the page in headless Chrome and drive the actual save/render paths rather than trusting a read of
the code. Past work here has caught a checkbox destroyed by the global `input` reset and a PR
double-count that only appears when one exercise is logged twice in a session; neither was
visible by inspection.

## Conventions

- Commit in small, separately-committed steps with descriptive messages explaining *why*.
- Match the surrounding code's density and idiom: terse, comma-chained statements, `$` for
  `querySelector`, delegated listeners, template literals for markup.
- Comment the non-obvious *reasoning*, not the mechanics.
- Mobile-first: the layout must hold at 320px, and wide content scrolls in its own container.
