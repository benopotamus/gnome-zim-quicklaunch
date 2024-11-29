import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const ZIM_CONFIG_DIR = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'zim']);
const NOTEBOOKS_LIST_FILE = GLib.build_filenamev([ZIM_CONFIG_DIR, 'notebooks.list']);

const ZimNotebooksIndicator = GObject.registerClass(
	class ZimNotebooksIndicator extends PanelMenu.Button {
		_init() {
			super._init(0.0, 'Zim Quick Launch');

			// Create box for the icon
			this.boxLayout = new St.BoxLayout();
			
			// Add the icon
			this.icon = new St.Icon({
				icon_name: 'accessories-text-editor-symbolic',
				style_class: 'system-status-icon'
			});
			this.boxLayout.add_child(this.icon);
			
			// Add the box to the panel button
			this.add_child(this.boxLayout);

			// Set up file monitoring
			this._notebooksMonitor = null;
			let file = Gio.File.new_for_path(NOTEBOOKS_LIST_FILE);
			try {
				this._notebooksMonitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
				this._notebooksMonitor.connect('changed', () => {
					this._loadNotebooks();
				});
			} catch (e) {
				console.error(`[Zim Quick Launch] Error monitoring notebooks file: ${e}`);
			}

			// Initial load of notebooks
			this._loadNotebooks();
		}

		_loadNotebooks() {
			// Clear existing menu items
			this.menu.removeAll();

			try {
				let [success, contents] = GLib.file_get_contents(NOTEBOOKS_LIST_FILE);
				if (success) {
					let lines = new TextDecoder().decode(contents).split('\n');
					let hasNotebooks = false;

					// Helper to process blocks
					let currentBlock = null;

					lines.forEach(line => {
						line = line.trim();
				
						// Ignore empty lines and comments
						if (line === '' || line.startsWith('#')) return;
				
						// Detect start of a block
						if (line.startsWith('[') && line.endsWith(']')) {
							if (currentBlock) {
								this._processNotebookBlock(currentBlock, () => hasNotebooks = true);
							}
							currentBlock = {};
						} else if (currentBlock) {
							// Parse key=value pairs
							let [key, value] = line.split('=').map(part => part.trim());
							if (key && value) {
								currentBlock[key] = value;
							}
						}
					});
				
					// Process the last block if any
					if (currentBlock) {
						this._processNotebookBlock(currentBlock, () => hasNotebooks = true);
					}

					if (!hasNotebooks) {
						let noNotebooksItem = new PopupMenu.PopupMenuItem('No notebooks found', { 
							reactive: false,
							style_class: 'popup-inactive-menu-item'
						});
						this.menu.addMenuItem(noNotebooksItem);
					}
				}
			} catch (e) {
				console.error(`[Zim Quick Launch] Error loading notebooks: ${e}`);
				let errorItem = new PopupMenu.PopupMenuItem('Error loading notebooks');
				this.menu.addMenuItem(errorItem);
			}
		}

		_processNotebookBlock(block, markNotebookFound) {
			// Extract the necessary values from the block
			let path = block['uri'];
			let name = block['name'];
		
			if (path && name) {
				// Expand `~` to the user's home directory
				path = path.replace(/^~/, GLib.get_home_dir());
		
				// Add the notebook to the menu
				let item = new PopupMenu.PopupMenuItem(name);
				item.connect('activate', () => {
					this._openNotebook(path);
				});
				this.menu.addMenuItem(item);
		
				markNotebookFound();
				console.debug(`[Zim Quick Launch] Added notebook: ${name} (${path})`);
			} else {
				console.debug(`[Zim Quick Launch] Incomplete block, skipping: ${JSON.stringify(block)}`);
			}
		}

		_openNotebook(path) {
			try {
				GLib.spawn_command_line_async(`zim "${path}"`);
			} catch (e) {
				console.error(`[Zim Quick Launch] Error opening notebook: ${e}`);
			}
		}

		destroy() {
			if (this._notebooksMonitor) {
				this._notebooksMonitor.cancel();
				this._notebooksMonitor = null;
			}
			super.destroy();
		}
	}
);

let indicator = null;

export default class Extension {
	enable() {
		console.debug('Enabling Zim Quick Launch');
		indicator = new ZimNotebooksIndicator();
		Main.panel.addToStatusArea('zim-quicklaunch', indicator);
	}

	disable() {
		console.debug('Disabling Zim Quick Launch');
		if (indicator) {
			indicator.destroy();
			indicator = null;
		}
	}
}