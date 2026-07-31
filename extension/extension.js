import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {ClipboardMonitor} from './clipboard.js';
import {askPasteIntoTxt} from './dialog.js';
import {ClipEntry, HistoryStore, makePreview} from './history.js';
import {openTextFile, saveTextFile, clearSpillFiles} from './longtext.js';

const MAX_HISTORY = 12;
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_IMAGES = 4;
const MAX_LABEL = 72;

const INLINE_TEXT_MAX = 32 * 1024;
const PROMPT_TEXT_MIN = 32 * 1024;
const PASTE_DELAY_MS = 80;

export default class ClipLiteExtension extends Extension {
    enable() {
        try {
            this._privateMode = false;
            this._history = new HistoryStore(MAX_HISTORY, MAX_IMAGE_BYTES, MAX_IMAGES);
            this._menuOpenId = 0;
            this._buttonPressId = 0;
            this._dialogOpen = false;
            this._pasteTimeoutId = 0;
            this._pasteKeyTimeoutId = 0;
            this._previousWindow = null;
            this._virtualKeyboard = null;
            this._settings = this.getSettings();

            this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
            this._indicator.add_child(new St.Icon({
                icon_name: 'edit-paste-symbolic',
                style_class: 'system-status-icon',
            }));

            // Remember the app that had focus before the menu steals it.
            this._buttonPressId = this._indicator.connect('button-press-event', () => {
                this._rememberFocusWindow();
                return Clutter.EVENT_PROPAGATE;
            });

            this._buildMenu();
            this._menuOpenId = this._indicator.menu.connect('open-state-changed', (_menu, open) => {
                if (open) {
                    if (!this._previousWindow)
                        this._rememberFocusWindow();
                    this._rebuildHistoryItems();
                } else {
                    this._historySection.removeAll();
                }
            });

            Main.panel.addToStatusArea(this.uuid, this._indicator);

            this._monitor = new ClipboardMonitor({
                onEntry: entry => this._onClipboardEntry(entry),
                isPaused: () => this._privateMode,
            });
            this._monitor.start();

            this._bindShortcut();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    disable() {
        this._unbindShortcut();

        if (this._pasteTimeoutId) {
            GLib.source_remove(this._pasteTimeoutId);
            this._pasteTimeoutId = 0;
        }
        if (this._pasteKeyTimeoutId) {
            GLib.source_remove(this._pasteKeyTimeoutId);
            this._pasteKeyTimeoutId = 0;
        }

        this._monitor?.stop();
        this._monitor = null;

        if (this._indicator && this._buttonPressId) {
            this._indicator.disconnect(this._buttonPressId);
            this._buttonPressId = 0;
        }

        if (this._indicator?.menu && this._menuOpenId) {
            this._indicator.menu.disconnect(this._menuOpenId);
            this._menuOpenId = 0;
        }

        this._historySection?.destroy();
        this._historySection = null;
        this._privateItem?.destroy();
        this._privateItem = null;
        this._clearItem?.destroy();
        this._clearItem = null;

        this._indicator?.destroy();
        this._indicator = null;
        this._history = null;
        this._dialogOpen = false;
        this._settings = null;
        this._previousWindow = null;
        this._virtualKeyboard = null;
    }

    _rememberFocusWindow() {
        try {
            this._previousWindow = global.display.focus_window;
        } catch (_e) {
            this._previousWindow = null;
        }
    }

    _bindShortcut() {
        Main.wm.addKeybinding(
            'toggle-menu',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => this._toggleMenu()
        );
    }

    _unbindShortcut() {
        try {
            Main.wm.removeKeybinding('toggle-menu');
        } catch (_e) {
            // ignore if never bound
        }
    }

    _toggleMenu() {
        if (!this._indicator)
            return;

        if (this._indicator.menu.isOpen) {
            this._indicator.menu.close();
        } else {
            this._rememberFocusWindow();
            this._indicator.menu.open();
        }
    }

    /**
     * Put entry on clipboard, then paste into the app that was focused
     * (Enter or click — like Windows Win+V).
     */
    async _selectAndPaste(entry) {
        await this._monitor.restore(entry);
        this._history.add(entry);
        this._indicator.menu.close();

        if (this._pasteTimeoutId)
            GLib.source_remove(this._pasteTimeoutId);

        this._pasteTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PASTE_DELAY_MS, () => {
            this._pasteTimeoutId = 0;
            this._pasteIntoPreviousWindow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _pasteIntoPreviousWindow() {
        try {
            if (this._previousWindow)
                this._previousWindow.activate(global.get_current_time());
        } catch (_e) {
            // ignore
        }

        if (!this._virtualKeyboard) {
            try {
                const seat = Clutter.get_default_backend().get_default_seat();
                this._virtualKeyboard = seat.create_virtual_device(
                    Clutter.InputDeviceType.KEYBOARD_DEVICE
                );
            } catch (_e) {
                return;
            }
        }

        if (this._pasteKeyTimeoutId)
            GLib.source_remove(this._pasteKeyTimeoutId);

        this._pasteKeyTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 40, () => {
            this._pasteKeyTimeoutId = 0;
            this._sendPasteHotkey();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sendPasteHotkey() {
        const kb = this._virtualKeyboard;
        if (!kb)
            return;

        const now = GLib.get_monotonic_time();
        let wm = '';
        try {
            wm = (this._previousWindow?.get_wm_class() || '').toLowerCase();
        } catch (_e) {
            wm = '';
        }

        // Terminals usually need Ctrl+Shift+V; most apps use Ctrl+V.
        const isTerminal = /terminal|tilix|kitty|alacritty|wezterm|ghostty|konsole|ptyxis|terminator/.test(wm);

        try {
            if (isTerminal) {
                kb.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
                kb.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
                kb.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.PRESSED);
                kb.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.RELEASED);
                kb.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
                kb.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
            } else {
                kb.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
                kb.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.PRESSED);
                kb.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.RELEASED);
                kb.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
            }
        } catch (_e) {
            // ignore
        }
    }

    _buildMenu() {
        const menu = this._indicator.menu;

        this._historySection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(this._historySection);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._privateItem = new PopupMenu.PopupSwitchMenuItem('Private mode', false);
        this._privateItem.connect('toggled', (_item, state) => {
            this._privateMode = state;
        });
        menu.addMenuItem(this._privateItem);

        this._clearItem = new PopupMenu.PopupMenuItem('Clear history');
        this._clearItem.connect('activate', () => {
            this._history.clear();
            try {
                clearSpillFiles();
            } catch (_e) {
                // ignore
            }
            if (this._indicator.menu.isOpen)
                this._rebuildHistoryItems();
        });
        menu.addMenuItem(this._clearItem);
    }

    _onClipboardEntry(entry) {
        if (!entry)
            return;

        if (entry.isText())
            this._handleTextEntry(entry);
        else
            this._commitEntry(entry);
    }

    _handleTextEntry(entry) {
        const full = entry.text || '';
        const len = full.length;

        if (len >= PROMPT_TEXT_MIN) {
            if (this._dialogOpen)
                return;

            this._dialogOpen = true;
            const kb = Math.round(len / 1024);
            askPasteIntoTxt({
                title: 'Paste into txt?',
                body: `Clipboard text is long (~${kb} KiB).\nSave as .txt and open in Text Editor?\n\n(Your full text stays available either way.)`,
                onYes: () => {
                    this._dialogOpen = false;
                    this._commitEntry(this._spillToFile(full, entry.mime, true));
                },
                onNo: () => {
                    this._dialogOpen = false;
                    this._commitEntry(this._storeTextEfficiently(full, entry.mime));
                },
            });
            return;
        }

        this._commitEntry(this._storeTextEfficiently(full, entry.mime));
    }

    _storeTextEfficiently(full, mime) {
        if (full.length <= INLINE_TEXT_MAX) {
            return new ClipEntry({
                kind: 'text',
                mime: mime || 'text/plain;charset=utf-8',
                text: full,
            });
        }
        return this._spillToFile(full, mime, false);
    }

    _spillToFile(full, mime, openEditor) {
        const path = saveTextFile(full);
        if (openEditor)
            openTextFile(path);
        return new ClipEntry({
            kind: 'text',
            mime: mime || 'text/plain;charset=utf-8',
            text: null,
            filePath: path,
            preview: makePreview(full),
        });
    }

    _commitEntry(entry) {
        if (!this._history.add(entry))
            return;
        if (this._indicator.menu.isOpen)
            this._rebuildHistoryItems();
    }

    _rebuildHistoryItems() {
        this._historySection.removeAll();

        const items = this._history.list();
        if (items.length === 0) {
            const empty = new PopupMenu.PopupMenuItem('Clipboard history is empty', {
                reactive: false,
            });
            empty.sensitive = false;
            this._historySection.addMenuItem(empty);
            return;
        }

        for (const entry of items) {
            const iconName = entry.isImage()
                ? 'image-x-generic-symbolic'
                : 'text-x-generic-symbolic';
            const item = new PopupMenu.PopupImageMenuItem(entry.label(MAX_LABEL), iconName);
            item.connect('activate', () => {
                // Click or Enter → copy back + paste into the last app
                this._selectAndPaste(entry);
            });
            this._historySection.addMenuItem(item);
        }
    }
}
