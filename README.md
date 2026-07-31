# Clip Lite

## What is this?

**Clip Lite** remembers things you copy.

On a normal computer, copy only keeps the **last** thing.  
If you copy something new, the old one is gone.

Clip Lite keeps a **short list** of recent copies  
(text and small pictures).  
You can pick an older one and paste it again.

It is made for the **GNOME** desktop on Linux  
(for example Fedora).

It tries to use **very little memory**.

---

## How to use it

1. Copy something with **Ctrl+C** (like always).
2. Press **Super+V**  
   (`Super` is often the key with the Windows logo).
3. Use the **arrow keys** (or click) to pick an item.
4. Press **Enter** (or click) — it pastes into the app you were using.

That is it.

---

## Extra buttons in the menu

| Button | What it does |
|--------|----------------|
| **Private mode** | Stop saving copies for a while. |
| **Clear history** | Forget the list and delete saved long text files. |

If you copy a **very long** text, Clip Lite may ask:  
**“Paste into txt?”**  
You can save it as a file and open it in a text editor.

---

## Install (for anyone)

You need GNOME on your computer.

```bash
git clone https://github.com/CarmineMattia/clipboard-fedora-gnome.git
cd clipboard-fedora-gnome
chmod +x install.sh
./install.sh
```

Then:

1. **Log out and log back in** (required on Wayland — do this before enable).
2. Run:

```bash
gnome-extensions enable clip-lite@local
```

3. Press **Super+V**.

If you see `Extension “clip-lite@local” does not exist`, you skipped step 1 — log out/in, then enable again.

### If Super+V opens notifications instead

```bash
gsettings set org.gnome.shell.keybindings toggle-message-tray "['<Super>n']"
```

### Remove it

```bash
gnome-extensions disable clip-lite@local
rm -f ~/.local/share/gnome-shell/extensions/clip-lite@local
```

---

## Simple facts

- Works on your computer only — **nothing is sent online**.
- Keeps about **12** recent items.
- Pictures bigger than about **half a megabyte** are skipped (to save memory).
- Free to use — see [LICENSE](./LICENSE).

More detail for adults / developers: [SECURITY.md](./SECURITY.md) · [RAM.md](./RAM.md)
