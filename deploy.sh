#!/usr/bin/env bash
# Publish Timbrio to Netlify.
#
# Deploys a clean `git archive` export rather than this folder directly: the working
# directory also holds recordings, transcripts and .env, and `netlify deploy` uploads
# whatever it is pointed at. Exporting from git guarantees only tracked files ship.
set -euo pipefail

OUT="$(mktemp -d)/timbrio"
mkdir -p "$OUT"
git archive HEAD | tar -x -C "$OUT"

echo "Publishing these files:"
(cd "$OUT" && find . -type f | sed 's|^\./|  |' | sort)
echo

# Refuse to continue if anything sensitive slipped in.
if (cd "$OUT" && ls .env *.m4a *.mp3 *.wav 2>/dev/null | grep -q .); then
  echo "Refusing to deploy: sensitive files found in the export." >&2
  exit 1
fi

npx netlify-cli deploy --prod --dir "$OUT"
