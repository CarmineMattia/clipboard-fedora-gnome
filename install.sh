#!/usr/bin/env bash
# Install Clip Lite for your user (no admin password needed).
set -euo pipefail

UUID="clip-lite@carminemattia.github.io"
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

# So the gsettings command can see the schema (Shell loads it from the extension too)
USER_SCHEMAS="${HOME}/.local/share/glib-2.0/schemas"
mkdir -p "${USER_SCHEMAS}"
cp -f "${EXT}/schemas/org.gnome.shell.extensions.clipboard-history.gschema.xml" "${USER_SCHEMAS}/"
glib-compile-schemas "${USER_SCHEMAS}"

# Clean older install folder names if present
rm -f "${HOME}/.local/share/gnome-shell/extensions/clipboard-history@"* 2>/dev/null || true
rm -f "${HOME}/.local/share/gnome-shell/extensions/clip-lite@local" 2>/dev/null || true

echo "Done. Clip Lite is installed."
echo
echo "Next:"
echo "  1. Log out and log in"
echo "  2. gnome-extensions enable ${UUID}"
echo "  3. Set a hotkey (example Super+V):"
echo "     dconf write /org/gnome/shell/extensions/clipboard-history/toggle-menu \"['<Super>v']\""
echo "     # or, after install.sh:"
echo "     gsettings set org.gnome.shell.extensions.clipboard-history toggle-menu \"['<Super>v']\""
echo
echo "If Super+V opens notifications, run this first:"
echo "  gsettings set org.gnome.shell.keybindings toggle-message-tray \"['<Super>n']\""
