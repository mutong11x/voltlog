#!/usr/bin/env bash
# Run every check against index.html. Exits non-zero if anything fails.
#
#   tools/check.sh          syntax + unit + browser
#   tools/check.sh unit     syntax + unit only (fast, no browser)
#   tools/check.sh syntax   syntax only
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="${VOLTLOG_TOOLS:-$HOME/.local/share/voltlog-tools}"
NODE_VER="${NODE_VER:-22.14.0}"
NODE="$TOOLS/node-v$NODE_VER-linux-x64/bin/node"
WHAT="${1:-all}"

if [ ! -x "$NODE" ]; then
  echo "No toolchain at $TOOLS — run tools/setup.sh first." >&2; exit 127
fi
export NODE_PATH="$TOOLS/node_modules"
export LD_LIBRARY_PATH="$TOOLS/libs/root/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"

fails=0
run(){ # run <label> <file>
  printf '\033[1m%s\033[0m\n' "$1"
  if "$NODE" "$2"; then :; else fails=$((fails+1)); fi
  echo
}

# 1. Syntax: the inline <script> is the whole app, and a stray brace ships silently otherwise.
printf '\033[1msyntax\033[0m\n'
python3 -c "import re,sys;print(re.findall(r'<script>(.*?)</script>',open('$ROOT/index.html').read(),re.S)[-1])" > /tmp/voltlog-app.js
if "$NODE" --check /tmp/voltlog-app.js; then echo "  ok  index.html parses"; else echo "FAIL  index.html does not parse"; fails=$((fails+1)); fi
echo
[ "$WHAT" = "syntax" ] && { [ $fails -eq 0 ] && echo "PASS" || echo "$fails FAILED"; exit $fails; }

# 2. Unit: real functions pulled from index.html, evaluated against stubs.
for f in "$ROOT"/tools/unit-*.js; do run "unit: $(basename "$f" .js)" "$f"; done
[ "$WHAT" = "unit" ] && { [ $fails -eq 0 ] && echo "PASS" || echo "$fails FAILED"; exit $fails; }

# 3. Browser: the real page in headless Chrome, driven through the real save/render paths.
#    Past bugs here were invisible to inspection — a checkbox destroyed by the global input
#    reset, a PR double-count, a canvas destroyed by its own empty state.
for f in "$ROOT"/tools/e2e-*.js; do run "browser: $(basename "$f" .js)" "$f"; done

if [ $fails -eq 0 ]; then printf '\033[32mPASS\033[0m — all suites green\n'; else printf '\033[31m%s SUITE(S) FAILED\033[0m\n' "$fails"; fi
exit $fails
