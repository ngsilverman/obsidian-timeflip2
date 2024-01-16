import moment from 'moment';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, RequestUrlResponse, Setting, TFile, normalizePath, requestUrl, setIcon } from 'obsidian';

// Remember to rename these classes and interfaces!

interface TimeFlip2Data {
	settings: TimeFlip2Settings,
	token: string
}

interface TimeFlip2Settings {
	email: string,
	password: string
}

type SimplifiedDailyReport = {
	dateStr: string,
	tasks: { name: string, totalTimeSec: number, totalTimeMin: number }[]
}

type SimplifiedDailyReports = {
	[dateStr: string]: SimplifiedDailyReport
}

const DEFAULT_SETTINGS: Partial<TimeFlip2Settings> = {}

export default class MyPlugin extends Plugin {
	public api: TimeFlip2Api
	public data: TimeFlip2Data
	public settings: TimeFlip2Settings

	async onload() {
		await this.customLoadData()

		this.api = new TimeFlip2Api(this)

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

		this.addCommand({
			id: 'import-data-to-today-daily-note',
			name: 'Import data to today\'s daily note',
			callback: () => this.importToTodayDailyNote()
		});

		this.addCommand({
			id: 'import-data-to-all-daily-notes',
			name: 'Import data to all daily notes',
			callback: () => this.importToAllDailyNotes()
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
	 * /!\ Does not support concurrent modifications of the same file.
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
		if (currentValue !== updatedValue) {
			const updateFun = currentValue === undefined ? createYamlProperty : update
			updateFun(propName, updatedValue, file)
		}
	}

	private dailyNotes() {
		return (this.app as any).internalPlugins.plugins["daily-notes"].instance
	}

	private getDailyNoteFile(moment: moment.Moment): TFile {
		const { folder, format } = this.dailyNotes().options
		const path = normalizePath(folder + '/' + moment.format(format)) + '.md'
		const file = this.app.vault.getAbstractFileByPath(path)
		return file as TFile
	}

	private async updateDailyNoteProps(dailyReport: SimplifiedDailyReport) {
		const { dateStr, tasks } = dailyReport
		const m = moment(dateStr)
		const file = this.getDailyNoteFile(m)
		// TODO If the Daily Note file doesn't exist yet (and the date is not in the future), create it.
		if (file !== null) {
			const activeTasks = tasks.filter(t => t.totalTimeMin > 0)
			for (const task of activeTasks) {
				const propName = task.name + ' (min)'
				await this.updateFileProp(file, propName, () => task.totalTimeMin)
				// TODO Without this sometimes the edits seem to happen concurrently which results in broken YAML.
				await sleep(100)
			}
		}
	}

	private async importToTodayDailyNote() {
		const notice = new DynamicNotice('loader', 'Importing TimeFlip2 data to today\'s Daily Note…')

		const dateStr = moment().format('YYYY-MM-DD')
		const dailyReports = await this.api.getDailyReports(dateStr, dateStr)
		const dailyReport = dailyReports[dateStr]
		if (dailyReport !== null) {
			await this.updateDailyNoteProps(dailyReport)
    		notice.update('check', `TimeFlip2 data imported for ${dailyReport.tasks.length} tasks`)
			notice.hideIn(2000)
		} else {
			notice.update('alert-circle', 'No TimeFlip2 data for today')
		}
	}

	private async importToAllDailyNotes() {
		const notice = new DynamicNotice('loader', 'Importing TimeFlip2 data to all Daily Notes…')

		const dailyReports = await this.api.getDailyReports()
		Object.values(dailyReports).forEach(this.updateDailyNoteProps)

		notice.update('check', `TimeFlip2 data imported for ${Object.values(dailyReports).length} days`)
		notice.hideIn(2000)
	}
}

class DynamicNotice {

	private notice: Notice
	private iconEl: HTMLElement
	private textEl: HTMLElement

	constructor(iconId: string, text: string) {
		const fragment = createFragment(el => {
			const containerEl = el.createDiv({ cls: 'timeflip2-dynamic-notice' })
			this.iconEl = containerEl.createSpan({ cls: 'timeflip2-icon' })
			setIcon(this.iconEl, iconId)
			this.textEl = containerEl.createSpan({ text: text})
		})
		this.notice = new Notice(fragment, 0)
	}

	public update(iconId: string, text: string) {
		setIcon(this.iconEl, iconId)
		this.textEl.innerText = text
	}

	public hide() {
		this.notice.hide()
	}

	public hideIn(durationMs: number) {
		setTimeout(() => {
			this.notice.hide()
		}, durationMs)
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
			.setName('Email')
			.addText(text => text
				.setPlaceholder('Enter your account email')
				.setValue(this.plugin.settings.email)
				.onChange(async (value) => {
					this.plugin.settings.email = value
					await this.plugin.customSaveData()
				}))

		new Setting(containerEl)
			.setName('Password')
			.addText(text => text
				.setPlaceholder('Enter your account password')
				.setValue(this.plugin.settings.password)
				.onChange(async (value) => {
					this.plugin.settings.password = value
					await this.plugin.customSaveData()
				}))

		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Sign in')
				.onClick(() => {
					const { email, password } = this.plugin.settings
					this.plugin.api.signIn(email, password)
				}))
	}
}

class TimeFlip2Api {
	private plugin: MyPlugin

	private baseUrl = 'https://newapi.timeflip.io'

	public constructor(plugin: MyPlugin) {
		this.plugin = plugin
	}

	public async signIn(email: string, password: string) {
		return requestUrl({
			url: this.baseUrl + '/api/auth/email/sign-in',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: email,
				password: password
			})
		})
			.then((response) => {
				this.plugin.data.token = response.headers.token
				this.plugin.customSaveData()
			})
	}

	public async getDailyReports(beginDateStr?: string, endDateStr?: string) {
		return requestUrl({
			url: this.baseUrl + '/report/daily',
			method: 'POST',
			headers: {
				'Authorization': 'Bearer ' + this.plugin.data.token,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ beginDateStr, endDateStr })
		})
			.then(this.simplifyDailyReports)
	}

	private simplifyDailyReports(dailyReportsResponse: RequestUrlResponse): SimplifiedDailyReports {
		const { weeks } = dailyReportsResponse.json

		const days = weeks.map((week: any) => {
			return week.days.map((day: any) => {
				return {
					dateStr: day.dateStr,
					tasks: day.tasksInfo.map((taskInfo: any) => {
						return {
							name: taskInfo.task.name,
							totalTimeSec: taskInfo.totalTime,
							totalTimeMin: Math.round(taskInfo.totalTime / 60)
						}
					})
				}
			})
		}).flat()

		const simplifiedDailyReports: SimplifiedDailyReports = {}
		days.forEach((day: any) => simplifiedDailyReports[day.dateStr] = day)
		return simplifiedDailyReports
	}
}
