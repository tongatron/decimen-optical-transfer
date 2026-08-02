#!/bin/sh
set -eu

mode=${1:-auto}
case "$mode" in
  auto|--all|--nautilus|--dolphin) ;;
  *)
    printf '%s\n' "Usage: $0 [--all|--nautilus|--dolphin]" >&2
    exit 2
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
user_home=${DECIMEN_USER_HOME:-$HOME}
decimen_bin=$(command -v decimen 2>/dev/null || true)
if [ -z "$decimen_bin" ] && [ -x "$user_home/.local/bin/decimen" ]; then
  decimen_bin="$user_home/.local/bin/decimen"
fi
if [ -z "$decimen_bin" ]; then
  printf '%s\n' "Install the decimen command before adding file-manager actions." >&2
  exit 1
fi

launcher_directory="$user_home/.local/lib/decimen"
launcher="$launcher_directory/send-with-decimen"
config_directory="$user_home/.config/decimen"
mkdir -p "$launcher_directory" "$config_directory"
cp "$script_dir/send-with-decimen-terminal.sh" "$launcher"
chmod 755 "$launcher"
printf '%s\n' "$decimen_bin" > "$config_directory/cli-path"

install_nautilus() {
  destination_directory="$user_home/.local/share/nautilus/scripts"
  mkdir -p "$destination_directory"
  cp "$script_dir/nautilus-send-with-decimen.sh" "$destination_directory/Send with Decimen"
  chmod 755 "$destination_directory/Send with Decimen"
  printf '%s\n' "Installed GNOME Files action: Scripts > Send with Decimen"
}

install_dolphin() {
  destination_directory="$user_home/.local/share/kio/servicemenus"
  destination="$destination_directory/decimen-send.desktop"
  mkdir -p "$destination_directory"
  escaped_launcher=$(printf '%s' "$launcher" | sed 's/[&|]/\\&/g')
  sed "s|@LAUNCHER@|$escaped_launcher|g" "$script_dir/decimen-send.desktop.in" > "$destination"
  chmod 755 "$destination"
  printf '%s\n' "Installed Dolphin action: Actions > Send with Decimen"
}

installed=0
if [ "$mode" = "--all" ] || [ "$mode" = "--nautilus" ] ||
   { [ "$mode" = "auto" ] && { command -v nautilus >/dev/null 2>&1 ||
       [ -d "$user_home/.local/share/nautilus" ]; }; }; then
  install_nautilus
  installed=1
fi
if [ "$mode" = "--all" ] || [ "$mode" = "--dolphin" ] ||
   { [ "$mode" = "auto" ] && { command -v dolphin >/dev/null 2>&1 ||
       command -v qtpaths >/dev/null 2>&1; }; }; then
  install_dolphin
  installed=1
fi

if [ "$installed" -eq 0 ]; then
  printf '%s\n' "No supported file manager detected. Use --nautilus or --dolphin." >&2
  exit 1
fi
