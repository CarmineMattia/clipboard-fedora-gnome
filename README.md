# Clip Lite

**Never lose a copy again.**

Your computer normally keeps only the **last** thing you copied.  
Clip Lite keeps a **short list** of recent copies (words and small pictures).

Made for **GNOME** on Linux (like Fedora).  
Uses **little memory**. Reads your **clipboard** on your PC only — nothing goes online.

---

## How to use it

1. Copy with **Ctrl+C**.
2. Open the list (see hotkey below).
3. Pick an item with arrows or the mouse.
4. Press **Enter** — it pastes into the app you were using.

### Set the hotkey (needed once)

There is **no** hotkey until you set one.  
**Super+V** is a good choice (`Super` = Windows-logo key).

**Easy way — run this in a terminal:**

```bash
gsettings set org.gnome.shell.extensions.clipboard-history toggle-menu "['<Super>v']"
```

If Super+V opens notifications instead, free it first:

```bash
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>n']"
gsettings set org.gnome.shell.extensions.clipboard-history toggle-menu "['<Super>v']"
```

You can also click the **paste icon** in the top bar to open the list.

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
2. `gnome-extensions enable clip-lite@local`  
3. Set the hotkey (command above).  
4. Copy something, press your hotkey, press Enter.

---

## Simple facts

- About **12** items max (oldest drop off)  
- Big pictures are skipped to save memory  
- Free — [MIT license](./LICENSE)

More: [SECURITY.md](./SECURITY.md) · [RAM.md](./RAM.md)
