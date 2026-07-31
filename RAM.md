# CPU & memory (simple)

Clip Lite is **not** its own app. It lives inside **GNOME Shell**.

So you will not see a process named “Clip Lite” — only `gnome-shell`.

## About how much it uses

| Resource | Typical | Worst case (our caps) |
|----------|---------|------------------------|
| **RAM (our data)** | often under **~1 MB** | text ≤ ~0.4 MB + pictures ≤ ~2 MB |
| **CPU idle** | near **0%** | tiny wake every **3 seconds** (backup check) |
| **CPU on copy** | a short spike | only when you Ctrl+C |
| **Extra program** | none | — |

Code on disk: about **40 KB**.

This is already a **good / lean** result for a clipboard history tool.  
Cutting more would mean dropping features (for example: no picture history, or weaker copy detection).

## Track it on Fedora

### 1) GNOME Shell memory (easiest)

```bash
ps -o pid,rss,pcpu,comm -C gnome-shell
```

`RSS` is memory in **kilobytes** (divide by 1024 → MB).  
`%CPU` is CPU use right now.

### 2) Before / after Clip Lite

```bash
# note the number
ps -o rss= -C gnome-shell

gnome-extensions disable clip-lite@carminemattia.github.io
sleep 2
ps -o rss= -C gnome-shell

gnome-extensions enable clip-lite@carminemattia.github.io
sleep 2
ps -o rss= -C gnome-shell
```

The difference is rough (GNOME also does other things). Repeat a few times.

### 3) Live view

```bash
# install once if needed:
# sudo dnf install -y htop

htop -p "$(pgrep -d, -x gnome-shell)"
```

Watch `gnome-shell` while you copy and open **Super+V**.

### 4) System monitor app

Open **System Monitor** → search **gnome-shell** → Memory / CPU.

## Always on at boot?

If `gnome-extensions info clip-lite@carminemattia.github.io` shows **Enabled: Yes**,  
Fedora/GNOME will load it again after restart.

Check after reboot:

```bash
gnome-extensions info clip-lite@carminemattia.github.io
```

You want: `Enabled: Yes` and `State: ACTIVE`.
