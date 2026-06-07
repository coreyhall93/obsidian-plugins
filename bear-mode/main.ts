import {
	App,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

interface BearModeSettings {
	/** Apply the Bear-style theme (typography, accent, tag pills). */
	enableTheme: boolean;
	/** Bear's signature single accent color, applied across the UI. */
	accentColor: string;
	/** Show the Bear-style word / character / reading-time bar in the status bar. */
	showInfoBar: boolean;
	/** Reading speed used to estimate the "min read" figure. */
	wordsPerMinute: number;
}

const DEFAULT_SETTINGS: BearModeSettings = {
	enableTheme: true,
	// Bear's classic red.
	accentColor: "#e0484c",
	showInfoBar: true,
	wordsPerMinute: 200,
};

const BODY_CLASS = "bear-mode-enabled";

export default class BearModePlugin extends Plugin {
	settings: BearModeSettings;
	private statusBarItem: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("bear-mode-info-bar");

		this.applyTheme();
		this.applyAccent();

		this.addSettingTab(new BearModeSettingTab(this.app, this));

		// Keep the info bar in sync with whatever note is focused / edited.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				this.updateInfoBar()
			)
		);
		this.registerEvent(
			this.app.workspace.on("editor-change", () => this.updateInfoBar())
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.updateInfoBar())
		);

		this.addCommand({
			id: "toggle-bear-theme",
			name: "Toggle Bear theme",
			callback: async () => {
				this.settings.enableTheme = !this.settings.enableTheme;
				await this.saveSettings();
				this.applyTheme();
			},
		});

		this.app.workspace.onLayoutReady(() => this.updateInfoBar());
	}

	onunload() {
		document.body.removeClass(BODY_CLASS);
		document.body.style.removeProperty("--bear-accent");
	}

	applyTheme() {
		document.body.toggleClass(BODY_CLASS, this.settings.enableTheme);
	}

	applyAccent() {
		document.body.style.setProperty(
			"--bear-accent",
			this.settings.accentColor
		);
	}

	updateInfoBar() {
		const item = this.statusBarItem;
		if (!item) return;

		if (!this.settings.showInfoBar) {
			item.setText("");
			item.hide();
			return;
		}
		item.show();

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			item.setText("");
			return;
		}

		const text = view.editor.getValue();
		const words = (text.match(/[\p{L}\p{N}'’\-]+/gu) || []).length;
		const characters = text.length;
		const minutes = Math.max(
			1,
			Math.round(words / Math.max(1, this.settings.wordsPerMinute))
		);

		item.setText(
			`${plural(words, "word")} · ${plural(
				characters,
				"character"
			)} · ${minutes} min read`
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function plural(n: number, noun: string): string {
	return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

class BearModeSettingTab extends PluginSettingTab {
	plugin: BearModePlugin;

	constructor(app: App, plugin: BearModePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Bear theme")
			.setDesc(
				"Apply Bear-style typography, accent color, and tag pills to the workspace."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTheme)
					.onChange(async (value) => {
						this.plugin.settings.enableTheme = value;
						await this.plugin.saveSettings();
						this.plugin.applyTheme();
					})
			);

		new Setting(containerEl)
			.setName("Accent color")
			.setDesc(
				"Bear uses a single accent color throughout. This drives headings, links, tags, and selections."
			)
			.addColorPicker((picker) =>
				picker
					.setValue(this.plugin.settings.accentColor)
					.onChange(async (value) => {
						this.plugin.settings.accentColor = value;
						await this.plugin.saveSettings();
						this.plugin.applyAccent();
					})
			);

		new Setting(containerEl)
			.setName("Info bar")
			.setDesc(
				"Show a Bear-style word / character / reading-time readout in the status bar."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showInfoBar)
					.onChange(async (value) => {
						this.plugin.settings.showInfoBar = value;
						await this.plugin.saveSettings();
						this.plugin.updateInfoBar();
					})
			);

		new Setting(containerEl)
			.setName("Reading speed")
			.setDesc("Words per minute used to estimate reading time.")
			.addSlider((slider) =>
				slider
					.setLimits(100, 400, 10)
					.setValue(this.plugin.settings.wordsPerMinute)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.wordsPerMinute = value;
						await this.plugin.saveSettings();
						this.plugin.updateInfoBar();
					})
			);
	}
}
