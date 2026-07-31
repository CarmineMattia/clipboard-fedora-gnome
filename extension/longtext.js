import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const SPILL_SUBDIR = 'clip-lite';

/** Private directory for spilled long clipboard texts (~/.local/share/clip-lite). */
export function getSpillDir() {
    const dir = GLib.build_filenamev([GLib.get_user_data_dir(), SPILL_SUBDIR]);
    GLib.mkdir_with_parents(dir, 0o700);
    try {
        GLib.chmod(dir, 0o700);
    } catch (_e) {
        // best effort
    }
    return dir;
}

/** Reject path traversal — only our spill dir is allowed. */
export function isSpillPath(path) {
    if (!path || typeof path !== 'string')
        return false;
    if (path.includes('\0') || path.includes('..'))
        return false;
    const dir = getSpillDir();
    const normalized = Gio.File.new_for_path(path).get_path();
    const base = Gio.File.new_for_path(dir).get_path();
    if (!normalized || !base)
        return false;
    return normalized === base || normalized.startsWith(`${base}/`);
}

/**
 * Write full text to a private .txt file. Returns absolute path.
 * @param {string} text
 * @returns {string}
 */
export function saveTextFile(text) {
    const dir = getSpillDir();
    const stamp = GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S');
    // Filename is timestamp-only — never embed clipboard content in the path.
    const path = GLib.build_filenamev([dir, `clipboard-${stamp}.txt`]);
    const bytes = new TextEncoder().encode(text ?? '');
    // Binary write then force owner-only permissions.
    GLib.file_set_contents(path, bytes);
    try {
        GLib.chmod(path, 0o600);
    } catch (_e) {
        // best effort
    }
    return path;
}

/**
 * Open a spill .txt in Text Editor when possible, else the default app.
 * Refuses paths outside the spill directory.
 * @param {string} path
 */
export function openTextFile(path) {
    if (!isSpillPath(path)) {
        console.error('[Clip Lite] refused to open path outside spill dir:', path);
        return;
    }

    const file = Gio.File.new_for_path(path);
    const uri = file.get_uri();
    if (!uri.startsWith('file:')) {
        console.error('[Clip Lite] refused non-file URI');
        return;
    }

    const editors = ['org.gnome.TextEditor.desktop', 'gnome-text-editor.desktop'];
    for (const desktop of editors) {
        try {
            const app = Gio.DesktopAppInfo.new(desktop);
            if (app) {
                app.launch_uris([uri], null);
                return;
            }
        } catch (_e) {
            // try next
        }
    }

    try {
        Gio.AppInfo.launch_default_for_uri(uri, null);
        return;
    } catch (error) {
        console.error('[Clip Lite] launch_default_for_uri failed:', error);
    }

    // argv form only — never shell-interpolate the path
    try {
        Gio.Subprocess.new(['xdg-open', path], Gio.SubprocessFlags.NONE);
    } catch (error) {
        console.error('[Clip Lite] xdg-open failed:', error);
    }
}

/**
 * Read entire UTF-8 text file (spill dir only).
 * @param {string} path
 * @returns {string}
 */
export function readTextFile(path) {
    if (!isSpillPath(path))
        throw new Error('Clip Lite: read refused (path outside spill dir)');
    const file = Gio.File.new_for_path(path);
    const [, contents] = file.load_contents(null);
    return new TextDecoder('utf-8', {fatal: false}).decode(contents);
}

/**
 * Delete spilled clipboard-*.txt files (used by Clear history).
 * @returns {number} files removed
 */
export function clearSpillFiles() {
    const dirPath = getSpillDir();
    const dir = Gio.File.new_for_path(dirPath);
    let removed = 0;

    let enumerator;
    try {
        enumerator = dir.enumerate_children(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
    } catch (error) {
        console.error('[Clip Lite] clearSpillFiles list failed:', error);
        return 0;
    }

    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name();
        if (!name || !name.startsWith('clipboard-') || !name.endsWith('.txt'))
            continue;
        if (info.get_file_type() !== Gio.FileType.REGULAR)
            continue;
        try {
            const child = dir.get_child(name);
            child.delete(null);
            removed++;
        } catch (error) {
            console.error('[Clip Lite] failed to delete', name, error);
        }
    }
    enumerator.close(null);
    return removed;
}
