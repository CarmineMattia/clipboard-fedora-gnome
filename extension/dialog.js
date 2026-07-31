import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

/**
 * Ask: save long clipboard text as .txt and open it?
 * @param {{ title?: string, body?: string, onYes: () => void, onNo?: () => void }} opts
 */
export function askPasteIntoTxt(opts) {
    const title = opts.title || 'Paste into txt?';
    const body = opts.body ||
        'This clipboard text is very long.\nSave it as a .txt file and open it?';

    const dialog = new LongTextDialog(title, body, () => {
        try {
            opts.onYes?.();
        } catch (error) {
            console.error('[Clip Lite] onYes failed:', error);
        }
    }, () => {
        try {
            opts.onNo?.();
        } catch (error) {
            console.error('[Clip Lite] onNo failed:', error);
        }
    });
    dialog.open();
    return dialog;
}

const LongTextDialog = GObject.registerClass(
class LongTextDialog extends ModalDialog.ModalDialog {
    _init(title, body, onYes, onNo) {
        super._init({styleClass: 'clip-lite-longtext-dialog'});

        const box = new St.BoxLayout({vertical: true, style_class: 'clip-lite-longtext-box'});
        this.contentLayout.add_child(box);

        box.add_child(new St.Label({
            text: title,
            style: 'font-weight: bold; font-size: 1.1em;',
            x_align: Clutter.ActorAlign.CENTER,
        }));

        box.add_child(new St.Label({
            text: body,
            style: 'padding-top: 12px;',
            x_align: Clutter.ActorAlign.CENTER,
        }));

        this.setButtons([
            {
                label: 'Not now',
                action: () => {
                    this.close();
                    onNo?.();
                },
                key: Clutter.KEY_Escape,
            },
            {
                label: 'Paste into txt',
                action: () => {
                    this.close();
                    onYes?.();
                },
                default: true,
            },
        ]);
    }
});
