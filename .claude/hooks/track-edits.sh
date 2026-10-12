#!/usr/bin/env bash
# PostToolUse (Edit|Write): record the edited file path for format-lint.sh (Stop).
# Cheap on purpose — no Prettier/ESLint here.

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
session=$(jq -r '.session_id // empty' <<<"$input")
[ -z "$file" ] || [ -z "$session" ] && exit 0

echo "$file" >>"${TMPDIR:-/tmp}/claude-edits-$session.list"
exit 0
