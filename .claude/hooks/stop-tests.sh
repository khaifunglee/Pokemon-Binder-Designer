#!/usr/bin/env bash
# Stop hook: runs the test suite when Claude tries to end its turn.
# Exit 2 blocks the stop and sends the failures back to Claude, so it keeps fixing.
set -uo pipefail
input=$(cat)

# Loop guard: if Claude is already continuing because of this hook, let it stop.
# This allows one automatic fix round instead of an endless loop.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then exit 0; fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Skip when nothing changed since the last commit (e.g. a Q&A-only turn).
if git rev-parse --verify HEAD >/dev/null 2>&1 \
   && git diff --quiet HEAD -- \
   && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

# Jest (jest-expo preset) via package.json "test" script.
if [ -f package.json ] && grep -q '"test"[[:space:]]*:' package.json && ! grep -q 'no test specified' package.json; then
  cmd="npm test --silent"
else
  exit 0
fi

out=$($cmd 2>&1); rc=$?
[ "$rc" -eq 0 ] && exit 0

{
  echo "Tests failed: $cmd"
  echo "Fix the failures (or explain why they can't be fixed) before finishing."
  echo "$out" | tail -n 60
} >&2
exit 2
