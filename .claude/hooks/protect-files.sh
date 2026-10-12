#!/usr/bin/env bash
# PreToolUse (Edit|Write): block edits to generated files.

file=$(jq -r '.tool_input.file_path // empty')

case "$file" in
  */pnpm-lock.yaml)
    echo "pnpm-lock.yaml is generated — change dependencies via pnpm add/remove/install instead." >&2
    exit 2
    ;;
  */dist_chrome/* | */dist_firefox/*)
    echo "$file is build output — edit the source under src/ and rebuild." >&2
    exit 2
    ;;
esac

exit 0
