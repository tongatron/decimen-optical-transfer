#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
source_workflow="$script_dir/Send with Decimen.workflow"
services_dir="$HOME/Library/Services"
destination="$services_dir/Send with Decimen.workflow"

mkdir -p "$services_dir"
if [[ -e "$destination" ]]; then
  backup="$destination.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$destination" "$backup"
  print "Existing workflow backed up to: $backup"
fi

cp -R "$source_workflow" "$destination"
if [[ -x /System/Library/CoreServices/pbs ]]; then
  /System/Library/CoreServices/pbs -flush
fi
print "Installed Finder action: Send with Decimen"
print "In Finder, select one file and choose Action (three dots) > Send with Decimen."
