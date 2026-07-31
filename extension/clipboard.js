import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {ClipEntry, makePreview} from './history.js';

const CLIPBOARD = St.ClipboardType.CLIPBOARD;

const TEXT_MIMES = [
    'text/plain;charset=utf-8',
    'UTF8_STRING',
    'text/plain',
    'STRING',
];

const IMAGE_MIMES = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/bmp',
];

// Optional path/name for image copies (Files, some browsers). Tiny strings only.
const SOURCE_MIMES = [
    'text/uri-list',
    'x-special/gnome-copied-files',
    'text/x-moz-url',
];

const DEBOUNCE_MS = 150;
const RETRY_MS = 200;
const READ_TIMEOUT_MS = 4000;
const POLL_MS = 3000; // rare backup only — owner-changed does the real work
const MAX_IMAGE_BYTES = 512 * 1024;
const HARD_MAX_TEXT_CHARS = 2 * 1024 * 1024;
const MAX_SOURCE_CHARS = 96;

/**
 * Reliable Ctrl+C capture for text + images across many apps.
 */
export class ClipboardMonitor {
    /**
     * @param {{ onEntry: (entry: ClipEntry) => void, isPaused: () => boolean }} handlers
     */
    constructor({onEntry, isPaused}) {
        this._onEntry = onEntry;
        this._isPaused = isPaused;
        this._clipboard = St.Clipboard.get_default();
        this._selection = null;
        this._ownerChangedId = 0;
        this._debounceId = 0;
        this._retryId = 0;
        this._pollId = 0;
        this._suppressUntil = 0;
        this._lastKey = '';
        this._busy = false;
        this._stopped = false;
        this._byteArray = null;
        try {
            this._byteArray = imports.byteArray;
        } catch (_e) {
            this._byteArray = null;
        }
    }

    start() {
        this._stopped = false;
        const display = Shell.Global.get().get_display();
        this._selection = display.get_selection();
        this._ownerChangedId = this._selection.connect(
            'owner-changed',
            (_selection, type, _source) => {
                if (type !== Meta.SelectionType.SELECTION_CLIPBOARD)
                    return;
                this._scheduleRead('owner-changed');
            }
        );

        this._pollId = GLib.timeout_add(GLib.PRIORITY_LOW, POLL_MS, () => {
            if (this._stopped)
                return GLib.SOURCE_REMOVE;
            if (!this._busy && !this._isPaused?.() &&
                GLib.get_monotonic_time() >= this._suppressUntil)
                this._scheduleRead('poll');
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        this._stopped = true;
        this._cancelTimers();
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        if (this._selection && this._ownerChangedId) {
            this._selection.disconnect(this._ownerChangedId);
            this._ownerChangedId = 0;
        }
        this._selection = null;
        this._busy = false;
        this._lastKey = '';
    }

    /** Restore FULL content to the system clipboard (never a truncated preview). */
    restore(entry) {
        this._suppressUntil = GLib.get_monotonic_time() + 800 * 1000;
        this._lastKey = this._entryKey(entry);

        if (entry.isText()) {
            const full = entry.getFullText();
            this._clipboard.set_text(CLIPBOARD, full || '');
            return;
        }

        if (entry.isImage() && entry.data && entry.mime) {
            try {
                const bytes = this._byteArray
                    ? this._byteArray.toGBytes(entry.data)
                    : GLib.Bytes.new(entry.data);
                this._clipboard.set_content(CLIPBOARD, entry.mime, bytes);
            } catch (error) {
                console.error('[Clip Lite] restore image failed:', error);
            }
        }
    }

    _entryKey(entry) {
        if (!entry)
            return '';
        if (entry.isText()) {
            if (entry.filePath)
                return `f:${entry.filePath}`;
            const t = entry.text || '';
            return `t:${t.length}:${t.slice(0, 64)}:${t.slice(-32)}`;
        }
        return `i:${entry.mime}:${entry.data?.byteLength || 0}:${entry.data?.[0] || 0}:${entry.data?.[entry.data.byteLength - 1] || 0}`;
    }

    _cancelTimers() {
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = 0;
        }
        if (this._retryId) {
            GLib.source_remove(this._retryId);
            this._retryId = 0;
        }
    }

    _scheduleRead(reason) {
        if (this._stopped || this._isPaused?.())
            return;
        if (GLib.get_monotonic_time() < this._suppressUntil)
            return;

        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = 0;
        }

        const delay = reason === 'poll' ? 0 : DEBOUNCE_MS;
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._debounceId = 0;
            this._readAndEmit(reason, reason === 'owner-changed');
            return GLib.SOURCE_REMOVE;
        });
    }

    async _readAndEmit(reason, allowRetry) {
        if (this._stopped || this._busy || this._isPaused?.())
            return;
        if (GLib.get_monotonic_time() < this._suppressUntil)
            return;

        this._busy = true;
        let entry = null;
        try {
            entry = reason === 'poll'
                ? await this._readTextOnly()
                : await this._readFull();
        } catch (error) {
            console.error('[Clip Lite] read failed:', error);
            this._busy = false;
            return;
        }
        this._busy = false;

        if (this._stopped)
            return;

        if (!entry) {
            if (allowRetry) {
                if (this._retryId)
                    GLib.source_remove(this._retryId);
                this._retryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RETRY_MS, () => {
                    this._retryId = 0;
                    this._readAndEmit('retry', false);
                    return GLib.SOURCE_REMOVE;
                });
            }
            return;
        }

        const key = this._entryKey(entry);
        if (key === this._lastKey)
            return;
        if (GLib.get_monotonic_time() < this._suppressUntil)
            return;

        this._lastKey = key;
        try {
            this._onEntry?.(entry);
        } catch (error) {
            console.error('[Clip Lite] onEntry failed:', error);
        }
    }

    async _readFull() {
        const textEntry = await this._readTextViaMimes();
        if (textEntry)
            return textEntry;

        const imageEntry = await this._readImageViaMimes();
        if (imageEntry)
            return imageEntry;

        return this._readTextOnly();
    }

    _makeTextEntry(text, mime) {
        if (!text)
            return null;
        // Only refuse absurd sizes (Shell OOM protection). Do not silently shorten paste.
        if (text.length > HARD_MAX_TEXT_CHARS) {
            console.warn(`[Clip Lite] text exceeds ${HARD_MAX_TEXT_CHARS} chars; refusing in-memory keep`);
            // Still return truncated ONLY as last-resort crash guard — extension will spill to file.
            text = text.slice(0, HARD_MAX_TEXT_CHARS);
        }
        return new ClipEntry({
            kind: 'text',
            mime,
            text,
            preview: makePreview(text),
        });
    }

    async _readTextViaMimes() {
        if (!this._byteArray)
            return null;

        for (const mime of TEXT_MIMES) {
            const data = await this._getContentData(mime);
            if (!data || data.byteLength === 0)
                continue;

            let text = '';
            try {
                text = new TextDecoder('utf-8', {fatal: false}).decode(data);
            } catch (_e) {
                continue;
            }
            text = text.replace(/\0/g, '');
            if (!text)
                continue;

            const outMime = mime === 'UTF8_STRING' ? 'text/plain;charset=utf-8' : mime;
            return this._makeTextEntry(text, outMime);
        }
        return null;
    }

    async _readImageViaMimes() {
        if (!this._byteArray)
            return null;

        // Capture image bytes first; only then look up a cheap name/path.
        let image = null;
        for (const mime of IMAGE_MIMES) {
            const data = await this._getContentData(mime);
            if (!data || data.byteLength === 0)
                continue;
            if (data.byteLength > MAX_IMAGE_BYTES)
                continue;
            const outMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
            image = {mime: outMime, data};
            break;
        }
        if (!image)
            return null;

        const source = await this._readImageSource();
        return new ClipEntry({
            kind: 'image',
            mime: image.mime,
            data: image.data,
            source: source || null,
        });
    }

    /**
     * @returns {Promise<string|null>} basename or short path
     */
    async _readImageSource() {
        if (!this._byteArray)
            return null;

        for (const mime of SOURCE_MIMES) {
            const data = await this._getContentData(mime);
            if (!data || data.byteLength === 0)
                continue;

            let raw = '';
            try {
                raw = new TextDecoder('utf-8', {fatal: false}).decode(data);
            } catch (_e) {
                continue;
            }
            raw = raw.replace(/\0/g, '').trim();
            if (!raw)
                continue;

            const label = this._parseSourceLabel(raw, mime);
            if (label)
                return label;
        }
        return null;
    }

    _parseSourceLabel(raw, mime) {
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let uri = null;

        if (mime === 'x-special/gnome-copied-files') {
            for (const line of lines) {
                if (line === 'copy' || line === 'cut')
                    continue;
                if (line.startsWith('file:')) {
                    uri = line;
                    break;
                }
            }
        } else if (mime === 'text/x-moz-url') {
            uri = lines[0] || null;
        } else {
            for (const line of lines) {
                if (line.startsWith('#'))
                    continue;
                uri = line;
                break;
            }
        }

        if (!uri)
            return null;

        const clip = s => {
            if (!s)
                return null;
            if (s.length <= MAX_SOURCE_CHARS)
                return s;
            return `…${s.slice(-(MAX_SOURCE_CHARS - 1))}`;
        };

        try {
            const file = Gio.File.new_for_uri(uri);
            const name = file.get_basename();
            if (name && name !== '/')
                return clip(name);
            const path = file.get_path();
            return clip(path || null);
        } catch (_e) {
            try {
                const clean = uri.split('?')[0].split('#')[0];
                const seg = clean.split('/').filter(Boolean).pop() || null;
                if (!seg)
                    return null;
                let decoded = seg;
                try {
                    decoded = GLib.uri_unescape_string(seg, null) || seg;
                } catch (_e2) {
                    // keep seg
                }
                return clip(decoded);
            } catch (_e3) {
                return null;
            }
        }
    }

    async _readTextOnly() {
        const text = await this._getText();
        return this._makeTextEntry(text, 'text/plain;charset=utf-8');
    }

    _getContentData(mime) {
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled)
                    return;
                settled = true;
                if (timeoutId)
                    GLib.source_remove(timeoutId);
                resolve(value);
            };

            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, READ_TIMEOUT_MS, () => {
                finish(null);
                return GLib.SOURCE_REMOVE;
            });

            try {
                this._clipboard.get_content(CLIPBOARD, mime, (_clipboard, bytes) => {
                    if (!bytes) {
                        finish(null);
                        return;
                    }
                    let size = 0;
                    try {
                        size = bytes.get_size();
                    } catch (_e) {
                        finish(null);
                        return;
                    }
                    if (size <= 0) {
                        finish(null);
                        return;
                    }
                    try {
                        finish(this._byteArray.fromGBytes(bytes));
                    } catch (error) {
                        console.error(`[Clip Lite] fromGBytes(${mime}):`, error);
                        finish(null);
                    }
                });
            } catch (error) {
                console.error(`[Clip Lite] get_content(${mime}):`, error);
                finish(null);
            }
        });
    }

    _getText() {
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled)
                    return;
                settled = true;
                if (timeoutId)
                    GLib.source_remove(timeoutId);
                resolve(value || '');
            };

            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, READ_TIMEOUT_MS, () => {
                finish('');
                return GLib.SOURCE_REMOVE;
            });

            try {
                this._clipboard.get_text(CLIPBOARD, (_clipboard, text) => {
                    finish(text || '');
                });
            } catch (error) {
                console.error('[Clip Lite] get_text:', error);
                finish('');
            }
        });
    }
}
