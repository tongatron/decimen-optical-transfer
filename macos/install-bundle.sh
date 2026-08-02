#!/bin/zsh
set -euo pipefail

bundle_dir=${0:A:h}
install_dir="$HOME/.local/share/decimen"
bin_dir="$HOME/.local/bin"
launcher="$bin_dir/decimen"

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 "This installer is for macOS only."
  exit 1
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print -u2 "Node.js 18 or newer is required. Install Node.js, then run this installer again."
  exit 1
fi
node_major=$(node -p 'process.versions.node.split(".")[0]')
if (( node_major < 18 )); then
  print -u2 "Node.js 18 or newer is required (found $(node --version))."
  exit 1
fi
for required in dist dist-cli "Send with Decimen.workflow"; do
  if [[ ! -e "$bundle_dir/$required" ]]; then
    print -u2 "The installer bundle is incomplete: missing $required"
    exit 1
  fi
done

node_bin=$(command -v node)
mkdir -p "$install_dir" "$bin_dir"
rm -rf "$install_dir/dist" "$install_dir/dist-cli"
cp -R "$bundle_dir/dist" "$install_dir/dist"
cp -R "$bundle_dir/dist-cli" "$install_dir/dist-cli"

cat > "$launcher" <<EOF
#!/bin/zsh
exec "$node_bin" "$install_dir/dist-cli/decimen.cjs" "\$@"
EOF
chmod 755 "$launcher"

services_dir="$HOME/Library/Services"
destination="$services_dir/Send with Decimen.workflow"
mkdir -p "$services_dir"
if [[ -e "$destination" ]]; then
  backup="$destination.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$destination" "$backup"
  print "Existing workflow backed up to: $backup"
fi
cp -R "$bundle_dir/Send with Decimen.workflow" "$destination"
if [[ -x /System/Library/CoreServices/pbs ]]; then
  /System/Library/CoreServices/pbs -flush
fi

print "Decimen installed. Select a file in Finder and choose Send with Decimen."
print "CLI: $launcher"
