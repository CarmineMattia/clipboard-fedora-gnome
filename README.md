# Clip Lite

**Lightweight clipboard history** for GNOME (Fedora and friends).

Your PC normally keeps only the **last** copy.  
Clip Lite keeps a **short list** (text & images) so you can paste an older one.

It uses **little memory**. It only reads your clipboard on your computer — nothing goes online.

---

## How to use it

1. Copy with **Ctrl+C**.
2. Open the list with your hotkey (or click the paste icon up top).
3. Pick an item (arrows or mouse).
4. Press **Enter** — it pastes into the app you were using.

### Set the hotkey (once)

There is **no** hotkey until you set one. **Super+V** is a good choice  
(`Super` = key with the Windows logo).

**Simplest command:**

```bash
dconf write /org/gnome/shell/extensions/clipboard-history/toggle-menu "['<Super>v']"
```

If Super+V opens notifications, free it first:

```bash
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>n']"
dconf write /org/gnome/shell/extensions/clipboard-history/toggle-menu "['<Super>v']"
```

After a full `./install.sh`, this also works:

```bash
gsettings set org.gnome.shell.extensions.clipboard-history toggle-menu "['<Super>v']"
```

---

## Menu extras

- **Private mode** — stop saving copies for a while  
- **Clear history** — erase the list  

---

## Install

```bash
git clone https://github.com/CarmineMattia/clipboard-fedora-gnome.git
cd clipboard-fedora-gnome
chmod +x install.sh
./install.sh
```

1. Log out and log in.  
2. `gnome-extensions enable clip-lite@carminemattia.github.io`  
3. Set the hotkey (command above).  
4. Copy something → hotkey → Enter.

---

## Simple facts

- About **12** items max (oldest drop off)  
- Very big pictures are skipped to save memory  
- Free — [MIT license](./LICENSE)

More: [SECURITY.md](./SECURITY.md) · [RAM.md](./RAM.md)
