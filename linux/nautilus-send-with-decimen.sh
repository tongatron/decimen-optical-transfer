#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  message="Select exactly one file to send with Decimen."
  command -v notify-send >/dev/null 2>&1 && notify-send "Send with Decimen" "$message"
  printf '%s\n' "$message" >&2
  exit 2
fi

user_home=${DECIMEN_USER_HOME:-$HOME}
exec "$user_home/.local/lib/decimen/send-with-decimen" "$1"
