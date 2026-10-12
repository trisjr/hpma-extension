#!/usr/bin/env bash
# Stop: Prettier + ESLint --fix once per turn on every file edited this turn
# (paths collected by track-edits.sh). Remaining ESLint errors are fed back
# to Claude (exit 2), except when already continuing from a Stop hook.

input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
active=$(jq -r '.stop_hook_active // false' <<<"$input")
[ -z "$session" ] && exit 0

list="${TMPDIR:-/tmp}/claude-edits-$session.list"
[ -f "$list" ] || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

code=()
other=()
while IFS= read -r file; do
  [ -f "$file" ] || continue
  case "$file" in
    */node_modules/* | */dist_chrome/* | */dist_firefox/*) continue ;;
    *.ts | *.tsx | *.js | *.jsx | *.cjs) code+=("$file") ;;
    *.json | *.css | *.scss | *.md) other+=("$file") ;;
  esac
done < <(sort -u "$list")

rm -f "$list"

[ ${#code[@]} -eq 0 ] && [ ${#other[@]} -eq 0 ] && exit 0

pnpm exec prettier --write --log-level warn "${code[@]}" "${other[@]}" >/dev/null 2>&1

if [ ${#code[@]} -gt 0 ]; then
  if ! out=$(pnpm exec eslint --fix "${code[@]}" 2>&1); then
    if [ "$active" != "true" ]; then
      echo "ESLint errors after this turn's edits:" >&2
      echo "$out" >&2
      exit 2
    fi
  fi
fi

exit 0
