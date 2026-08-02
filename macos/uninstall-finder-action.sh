#!/bin/zsh
set -euo pipefail

workflow="$HOME/Library/Services/Send with Decimen.workflow"
if [[ ! -e "$workflow" ]]; then
  print "Send with Decimen is not installed."
  exit 0
fi

mkdir -p "$HOME/.Trash"
trash_target="$HOME/.Trash/Send with Decimen.workflow-$(date +%Y%m%d-%H%M%S)"
mv "$workflow" "$trash_target"
if [[ -x /System/Library/CoreServices/pbs ]]; then
  /System/Library/CoreServices/pbs -flush
fi
print "Moved Finder Quick Action to: $trash_target"
