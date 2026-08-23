# tools — checks for VOLTLOG

The app is deliberately one file with no build step. These checks keep it that way: nothing here
is imported by `index.html`, and nothing here ships. The toolchain (node, Chrome) installs
**outside** the repo so there is no `node_modules` next to the app.

## Use

```bash
tools/setup.sh          # once per machine — installs the toolchain (idempotent)
tools/check.sh          # everything: syntax + unit + browser
tools/check.sh unit     # skip the browser (fast)
tools/check.sh syntax   # just: does index.html parse
```

Non-zero exit means something failed. The toolchain lands in `~/.local/share/voltlog-tools`
(override with `VOLTLOG_TOOLS`).

## Why it is shaped like this

**Tests read the real code.** There is nothing to import from a single HTML file, so
`lib/harness.js` pulls the actual function text out of `index.html` by regex and evaluates it
against stubs. The tests therefore run the shipped code rather than a copy that can drift. The
cost is that renaming a function breaks its test loudly — which is the intended failure mode.

**The browser suites exist because inspection is not enough.** Every bug they cover was invisible
in a read of the source:

| Suite | Covers |
|---|---|
| `unit-categories` / — | `recategorize` backfill, the `LIB_VER 5` resync |
| `unit-reverse` / `e2e-reverse` | assisted lifts: excluded from volume, PRs to the lowest weight |
| `unit-lasttime` / `e2e-lasttime` | `prevEntry` cutoffs, `setPills` best-set, the repeat button |
| — / `e2e-rpe` | the empty state that used to destroy its own canvas |

Real bugs these caught: a checkbox flattened by the global `input` reset, a PR double-count that
only appeared when one exercise was logged twice in a session, a dashboard that crashed on its
second visit, and a `0 kg` set rendering as `–`.

**Browser suites run at 320px** and assert no horizontal overflow, because that is the layout
floor the app promises.

## Adding a check

Name it `unit-*.js` or `e2e-*.js` in this directory and `check.sh` picks it up — no registration.
Start from an existing one; `lib/harness.js` gives you `APP`, `grab()`, `sources()` and
`reporter()`.

## Notes

- WSL puts the Windows `node`/`npm` first on `PATH`. They cannot run Linux postinstall scripts, so
  `setup.sh` fetches and calls its own copy explicitly. Do not assume a bare `node` works.
- Headless Chrome needs libnss/libnspr/libasound, which are not installed and would need sudo.
  `setup.sh` downloads the `.deb`s and unpacks them into a private prefix instead.
- Screenshots from the browser suites go to `$TMPDIR/voltlog-*.png` — useful when a layout
  assertion fails.
