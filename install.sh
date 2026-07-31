#!/usr/bin/env bash
# Install Clip Lite for your user (no admin password needed).
set -euo pipefail

UUID="clip-lite@local"
ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT="${ROOT}/extension"
TARGET="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

if [[ ! -f "${EXT}/metadata.json" ]]; then
  echo "error: missing extension/metadata.json" >&2
  exit 1
fi

if ! command -v glib-compile-schemas >/dev/null; then
  echo "error: need glib-compile-schemas (package: glib2)" >&2
  exit 1
fi

glib-compile-schemas "${EXT}/schemas"
mkdir -p "$(dirname "${TARGET}")"

ln -sfn "${EXT}" "${TARGET}"

# Clean older install folder name if present (same project, previous id)
rm -f "${HOME}/.local/share/gnome-shell/extensions/clipboard-history@"* 2>/dev/null || true

echo "Done. Clip Lite is installed."
echo
echo "IMPORTANT on Wayland:"
echo "  Log out and log in FIRST."
echo "  Only then run:  gnome-extensions enable ${UUID}"
echo "  Then press Super+V"
echo
echo "If Super+V opens notifications:"
echo "  gsettings set org.gnome.shell.keybindings toggle-message-tray \"['<Super>n']\""
