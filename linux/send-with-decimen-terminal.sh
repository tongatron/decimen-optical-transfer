#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  printf '%s\n' "Select exactly one file to send with Decimen." >&2
  exit 2
fi

file_path=$1
if [ ! -f "$file_path" ]; then
  printf 'File not found: %s\n' "$file_path" >&2
  exit 2
fi

user_home=${DECIMEN_USER_HOME:-$HOME}
config_file="$user_home/.config/decimen/cli-path"
decimen_bin=""
if [ -r "$config_file" ]; then
  IFS= read -r decimen_bin < "$config_file" || true
fi
if [ -z "$decimen_bin" ] || [ ! -x "$decimen_bin" ]; then
  decimen_bin=$(command -v decimen 2>/dev/null || true)
fi
if [ -z "$decimen_bin" ]; then
  message="The decimen command is not installed or is not available in PATH."
  command -v notify-send >/dev/null 2>&1 && notify-send "Send with Decimen" "$message"
  printf '%s\n' "$message" >&2
  exit 127
fi

if command -v x-terminal-emulator >/dev/null 2>&1; then
  exec x-terminal-emulator -e "$decimen_bin" send "$file_path"
elif command -v kgx >/dev/null 2>&1; then
  exec kgx -- "$decimen_bin" send "$file_path"
elif command -v gnome-terminal >/dev/null 2>&1; then
  exec gnome-terminal -- "$decimen_bin" send "$file_path"
elif command -v konsole >/dev/null 2>&1; then
  exec konsole -e "$decimen_bin" send "$file_path"
elif command -v xterm >/dev/null 2>&1; then
  exec xterm -e "$decimen_bin" send "$file_path"
fi

message="No supported terminal emulator was found."
command -v notify-send >/dev/null 2>&1 && notify-send "Send with Decimen" "$message"
printf '%s\n' "$message" >&2
exit 127
