#!/bin/sh
set -eu

user_home=${DECIMEN_USER_HOME:-$HOME}
nautilus_action="$user_home/.local/share/nautilus/scripts/Send with Decimen"
dolphin_action="$user_home/.local/share/kio/servicemenus/decimen-send.desktop"
launcher="$user_home/.local/lib/decimen/send-with-decimen"
config_file="$user_home/.config/decimen/cli-path"

rm -f "$nautilus_action" "$dolphin_action" "$launcher" "$config_file"
rmdir "$user_home/.local/lib/decimen" 2>/dev/null || true
rmdir "$user_home/.config/decimen" 2>/dev/null || true

printf '%s\n' "Removed Decimen file-manager actions."
