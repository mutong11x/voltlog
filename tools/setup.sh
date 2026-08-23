#!/usr/bin/env bash
# Install the check toolchain. Idempotent — safe to re-run; skips whatever is already there.
#
# Everything lands OUTSIDE the repo (~/.local/share/voltlog-tools by default): the app is
# deliberately one file with no build step, and a node_modules tree next to index.html would
# undermine that. Override with VOLTLOG_TOOLS=/some/path.
set -euo pipefail

TOOLS="${VOLTLOG_TOOLS:-$HOME/.local/share/voltlog-tools}"
NODE_VER="${NODE_VER:-22.14.0}"
NODE_DIR="$TOOLS/node-v$NODE_VER-linux-x64"

mkdir -p "$TOOLS"
say(){ printf '\033[36m==\033[0m %s\n' "$*"; }

# 1. Node -----------------------------------------------------------------------------------
# WSL puts the Windows node/npm on PATH; those cannot run Linux postinstall scripts, so this
# fetches its own copy rather than trusting whatever `node` resolves to.
if [ -x "$NODE_DIR/bin/node" ]; then
  say "node $NODE_VER already present"
else
  say "fetching node $NODE_VER"
  curl -sSL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-linux-x64.tar.xz" -o "$TOOLS/node.tar.xz"
  tar xf "$TOOLS/node.tar.xz" -C "$TOOLS"
  rm -f "$TOOLS/node.tar.xz"
fi
export PATH="$NODE_DIR/bin:$PATH"

# 2. Puppeteer + its Chrome ------------------------------------------------------------------
if [ -d "$TOOLS/node_modules/puppeteer" ]; then
  say "puppeteer already installed"
else
  say "installing puppeteer (downloads Chrome, ~200MB)"
  [ -f "$TOOLS/package.json" ] || echo '{"private":true}' > "$TOOLS/package.json"
  ( cd "$TOOLS" && "$NODE_DIR/bin/node" "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" install puppeteer --no-fund --no-audit )
fi

# 3. Chrome's system libraries, unpacked without root ------------------------------------------
# Headless Chrome needs libnss/libnspr/libasound, which are not installed here and would need
# sudo. Downloading the .debs and unpacking them into a private prefix avoids that entirely.
if [ -f "$TOOLS/libs/root/usr/lib/x86_64-linux-gnu/libnss3.so" ]; then
  say "chrome libraries already unpacked"
else
  say "unpacking chrome's system libraries (no root needed)"
  mkdir -p "$TOOLS/libs"
  ( cd "$TOOLS/libs"
    ASOUND=libasound2t64
    apt-get download libnspr4 libnss3 "$ASOUND" 2>/dev/null || apt-get download libnspr4 libnss3 libasound2
    for d in *.deb; do dpkg-deb -x "$d" root; done
    rm -f ./*.deb )
fi

say "toolchain ready in $TOOLS"
say "run the checks with: tools/check.sh"
