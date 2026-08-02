#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir="$script_dir:h"
package_json="$project_dir/package.json"
version=$(node -p 'require(process.argv[1]).version' "$package_json")
stage=$(mktemp -d "${TMPDIR:-/tmp}/decimen-dmg.XXXXXX")
output_dir="$project_dir/release"
output="$output_dir/Decimen-$version.dmg"
trap 'rm -rf "$stage"' EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "The DMG builder is for macOS only."
  exit 1
fi

print "Building Decimen app and CLI..."
(cd "$project_dir" && npm run build && npm run build:cli)

mkdir -p "$stage/Decimen Installer"
cp -R "$project_dir/dist" "$stage/Decimen Installer/dist"
cp -R "$project_dir/dist-cli" "$stage/Decimen Installer/dist-cli"
cp -R "$project_dir/macos/Send with Decimen.workflow" \
  "$stage/Decimen Installer/Send with Decimen.workflow"
cp "$project_dir/macos/install-bundle.sh" "$stage/Decimen Installer/install-bundle.sh"
chmod 755 "$stage/Decimen Installer/install-bundle.sh"
osacompile -o "$stage/Decimen Installer/Install Decimen.app" \
  "$project_dir/macos/Install Decimen.applescript" >/dev/null

mkdir -p "$output_dir"
rm -f "$output"
hdiutil create -quiet -volname "Decimen $version" -srcfolder "$stage/Decimen Installer" \
  -ov -format UDZO "$output"
print "Created: $output"
