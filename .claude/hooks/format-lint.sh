#!/usr/bin/env bash
# PostToolUse (Edit|Write): Prettier + ESLint --fix on the edited file.
# Remaining ESLint errors are fed back to Claude (exit 2).

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] || [ ! -f "$file" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0

case "$file" in
  */node_modules/* | */dist_chrome/* | */dist_firefox/*) exit 0 ;;
esac

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.cjs)
    pnpm exec prettier --write --log-level warn "$file" >/dev/null 2>&1
    if ! out=$(pnpm exec eslint --fix "$file" 2>&1); then
      echo "ESLint errors in $file:" >&2
      echo "$out" >&2
      exit 2
    fi
    ;;
  *.json | *.css | *.scss | *.md)
    pnpm exec prettier --write --log-level warn "$file" >/dev/null 2>&1
    ;;
esac

exit 0
