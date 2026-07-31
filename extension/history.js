import {readTextFile} from './longtext.js';

let _nextEntryId = 1;

/**
 * Clipboard history entry (text, file-backed text, or image).
 * Panel shows a short label; restore always uses FULL content.
 * RAM: no duplicate preview when inline text exists; one short source string for images.
 */
export class ClipEntry {
    /**
     * @param {object} props
     * @param {'text'|'image'} props.kind
     * @param {string} props.mime
     * @param {string|null} [props.text]
     * @param {Uint8Array|null} [props.data]
     * @param {string|null} [props.filePath]
     * @param {string|null} [props.preview] only for file-backed text (no full text in RAM)
     * @param {string|null} [props.source] image name or short path
     */
    constructor({
        kind,
        mime,
        text = null,
        data = null,
        filePath = null,
        preview = null,
        source = null,
    }) {
        this.kind = kind;
        this.mime = mime;
        this.text = text;
        this.data = data;
        this.filePath = filePath;
        // Avoid duplicating text in RAM: preview only when text lives on disk.
        this.preview = text ? null : preview;
        this.source = source ? String(source).slice(0, 96) : null;
        this.id = _nextEntryId++;
    }

    isText() {
        return this.kind === 'text';
    }

    isImage() {
        return this.kind === 'image';
    }

    /** Drop heavy buffers so GC can reclaim (called when evicted). */
    dispose() {
        this.data = null;
        this.text = null;
        this.preview = null;
        this.source = null;
    }

    /** Full text for restore (from memory or file). Spill paths are validated. */
    getFullText() {
        if (!this.isText())
            return '';
        if (this.filePath) {
            try {
                return readTextFile(this.filePath);
            } catch (error) {
                console.error('[Clip Lite] read spill file failed:', error);
                return '';
            }
        }
        return this.text || '';
    }

    label(maxChars = 48) {
        if (this.isImage()) {
            const kb = this.data ? Math.round(this.data.byteLength / 1024) : 0;
            const short = (this.mime || 'image').replace('image/', '');
            const parts = [short];
            if (kb)
                parts.push(`${kb} KiB`);
            if (this.source)
                parts.push(this.source);
            let out = `Image (${parts.join(', ')})`;
            if (out.length > maxChars)
                out = `${out.slice(0, maxChars)}…`;
            return out;
        }

        const base = this.preview || this.text || (this.filePath ? 'Long text (.txt)' : '');
        const oneLine = String(base).replace(/\s+/g, ' ').trim();
        const prefix = this.filePath ? '📄 ' : '';
        if (oneLine.length <= maxChars)
            return prefix + oneLine;
        return `${prefix}${oneLine.slice(0, maxChars)}…`;
    }

    equals(other) {
        if (!other || this.kind !== other.kind)
            return false;
        if (this.isText()) {
            if (this.filePath && other.filePath)
                return this.filePath === other.filePath;
            return this.text === other.text && this.filePath === other.filePath;
        }
        if (this.mime !== other.mime)
            return false;
        if (!this.data || !other.data || this.data.byteLength !== other.data.byteLength)
            return false;
        const a = this.data;
        const b = other.data;
        const n = Math.min(32, a.byteLength);
        for (let i = 0; i < n; i++) {
            if (a[i] !== b[i] || a[a.byteLength - 1 - i] !== b[b.byteLength - 1 - i])
                return false;
        }
        return true;
    }
}

export class HistoryStore {
    constructor(maxSize = 12, maxImageBytes = 512 * 1024, maxImages = 4) {
        this._maxSize = Math.max(1, maxSize);
        this._maxImageBytes = Math.max(16 * 1024, maxImageBytes);
        this._maxImages = Math.max(1, maxImages);
        this._items = [];
    }

    get length() {
        return this._items.length;
    }

    list() {
        return this._items;
    }

    _imageCount() {
        let n = 0;
        for (const e of this._items) {
            if (e.isImage())
                n++;
        }
        return n;
    }

    _evict(index) {
        const [gone] = this._items.splice(index, 1);
        gone?.dispose?.();
    }

    add(entry) {
        if (!entry)
            return false;

        if (entry.isText()) {
            if (!entry.text && !entry.filePath)
                return false;
        } else if (entry.isImage()) {
            if (!entry.data || entry.data.byteLength === 0)
                return false;
            if (entry.data.byteLength > this._maxImageBytes)
                return false;
        } else {
            return false;
        }

        const existing = this._items.findIndex(e => e.equals(entry));
        if (existing === 0)
            return false;
        if (existing > 0)
            this._evict(existing);

        this._items.unshift(entry);

        while (this._imageCount() > this._maxImages) {
            for (let i = this._items.length - 1; i >= 0; i--) {
                if (this._items[i].isImage()) {
                    this._evict(i);
                    break;
                }
            }
        }

        while (this._items.length > this._maxSize)
            this._evict(this._items.length - 1);

        return true;
    }

    remove(entry) {
        const index = this._items.indexOf(entry);
        if (index === -1)
            return false;
        this._evict(index);
        return true;
    }

    clear() {
        if (this._items.length === 0)
            return false;
        for (const e of this._items)
            e.dispose?.();
        this._items = [];
        return true;
    }
}

/** Short one-line preview for file-backed entries only. */
export function makePreview(text, maxChars = 48) {
    if (!text)
        return '';
    const oneLine = text.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= maxChars)
        return oneLine;
    return `${oneLine.slice(0, maxChars)}…`;
}
