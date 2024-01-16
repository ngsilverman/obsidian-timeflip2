import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface TimeFlip2Data {
	settings: TimeFlip2Settings,
	token: string
}

interface TimeFlip2Settings {
	username: string,
	password: string
}

const DEFAULT_SETTINGS: Partial<TimeFlip2Settings> = {}

export default class MyPlugin extends Plugin {
	public settings: TimeFlip2Settings

	private data: TimeFlip2Data

	async onload() {
		await this.customLoadData()

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TimeFlip2SettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async customLoadData() {
		this.data = await this.loadData()
		this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings)
		this.settings = this.data.settings
	}

	async customSaveData() {
		await this.saveData(this.data)
	}

	private metaedit() {
		return (this.app as any).plugins.plugins["metaedit"].api
	}

	/**
	 * @param updateValue The argument will be `undefined` if the property doesn't exist yet.
	 */
	private async updateFileProp(
		file: TFile | string,
		propName: string,
		updateValue: (value?: string | number) => string | number | null
	) {
		const { getPropertyValue, createYamlProperty, update } = this.metaedit()
		const currentValue = await getPropertyValue(propName, file)
		const updatedValue = updateValue(currentValue)
		const updateFun = currentValue === undefined ? createYamlProperty : update
		await updateFun(propName, updatedValue, file)
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class TimeFlip2SettingTab extends PluginSettingTab {
	plugin: MyPlugin

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		new Setting(containerEl)
			.setName('Username')
			.addText(text => text
				.setPlaceholder('Enter your account username')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value
					await this.plugin.customSaveData()
				}))

		new Setting(containerEl)
			.setName('Password')
			.addText(text => text
				.setPlaceholder('Enter your account password')
				.setValue(this.plugin.settings.password)
				.onChange(async (value) => {
					this.plugin.settings.password = value
					await this.plugin.customLoadData()
				}))
	}
}
