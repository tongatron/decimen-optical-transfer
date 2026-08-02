#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
project_dir=${script_dir:h}
install_dir="$HOME/.local/share/decimen"
bin_dir="$HOME/.local/bin"
launcher="$bin_dir/decimen"

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This installer is for macOS only."
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  print -u2 "Node.js 18 or newer and npm are required. Install Node.js, then run this installer again."
  exit 1
fi

node_major=$(node -p 'process.versions.node.split(".")[0]')
if (( node_major < 18 )); then
  print -u2 "Node.js 18 or newer is required (found $(node --version))."
  exit 1
fi

print "Building Decimen app and CLI..."
(cd "$project_dir" && npm run build && npm run build:cli)

mkdir -p "$install_dir" "$bin_dir"
rm -rf "$install_dir/dist"
rm -rf "$install_dir/dist-cli"
cp -R "$project_dir/dist" "$install_dir/dist"
cp -R "$project_dir/dist-cli" "$install_dir/dist-cli"
cp "$project_dir/package.json" "$install_dir/package.json"

cat > "$launcher" <<'EOF'
#!/bin/zsh
exec /usr/bin/env node "$HOME/.local/share/decimen/dist-cli/decimen.cjs" "$@"
EOF
chmod 755 "$launcher"

"$script_dir/install-finder-action.sh"

print ""
print "Decimen installed for the current user."
print "CLI: $launcher"
print "App build: $install_dir/dist"
print "Finder action: Send with Decimen"
if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
  print "Add this directory to your shell PATH if needed:"
  print "  export PATH=\"$bin_dir:\$PATH\""
fi
print "Test with: $launcher --version"
