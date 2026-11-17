#!/usr/bin/env bash
# PostToolUse hook: lints the file Claude just edited.
# Exit 2 sends the lint errors back to Claude so it fixes them straight away.
# NOTE: this repo has no ESLint yet, so this is a no-op until ESLint is installed.
set -uo pipefail
input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
if [ -z "$file" ] || [ ! -f "$file" ]; then exit 0; fi
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    [ -x node_modules/.bin/eslint ] || exit 0
    out=$(node_modules/.bin/eslint "$file" 2>&1) || { echo "ESLint errors in $file:" >&2; echo "$out" >&2; exit 2; }
    ;;
  *)
    exit 0
    ;;
esac
exit 0
