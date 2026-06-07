import {
	App,
	ItemView,
	MarkdownView,
	Menu,
	Modal,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
	getAllTags,
	setIcon,
} from "obsidian";

export const VIEW_TYPE_BEAR = "bear-sidebar";

// Special pseudo-tags used by the sidebar's tag list.
const TAG_ALL = null;
const TAG_TODAY = "__today__";
const TAG_TODO = "__todo__";
const TAG_UNTAGGED = "__untagged__";
const TAG_ARCHIVE = "__archive__";

type NoteSort = "modified" | "created" | "title";

const SORT_LABEL: Record<NoteSort, string> = {
	modified: "Modified date",
	created: "Created date",
	title: "Title",
};

interface BearTheme {
	id: string;
	name: string;
	/** Accent color; empty means "use the custom color picker value". */
	accent: string;
}

// Bear's signature themes, approximated by their accent colors.
const BEAR_THEMES: BearTheme[] = [
	{ id: "red-graphite", name: "Red Graphite", accent: "#e0484c" },
	{ id: "charcoal", name: "Charcoal", accent: "#f24b59" },
	{ id: "solarized", name: "Solarized", accent: "#268bd2" },
	{ id: "gotham", name: "Gotham", accent: "#2aa198" },
	{ id: "toothpaste", name: "Toothpaste", accent: "#16b8c4" },
	{ id: "cobalt", name: "Cobalt", accent: "#2f72e0" },
	{ id: "dracula", name: "Dracula", accent: "#bd93f9" },
	{ id: "panic-mode", name: "Panic Mode", accent: "#ff3b30" },
	{ id: "custom", name: "Custom", accent: "" },
];

interface BearModeSettings {
	/** Apply the Bear-style theme (typography, accent, tag pills). */
	enableTheme: boolean;
	/** The selected named Bear theme (or "custom"). */
	themePreset: string;
	/** Bear's signature single accent color, applied across the UI. */
	accentColor: string;
	/** Show the Bear-style word / character / reading-time bar in the status bar. */
	showInfoBar: boolean;
	/** Reading speed used to estimate the "min read" figure. */
	wordsPerMinute: number;
	/** Show a one-line body preview under each note in the Bear sidebar. */
	showSnippets: boolean;
	/** How the note list is ordered. */
	noteSort: NoteSort;
	/** Open the Bear sidebar automatically when the app starts. */
	openSidebarOnStartup: boolean;
	/** Paths of notes pinned to the top of the list. */
	pinned: string[];
	/** Folder that holds archived notes. */
	archiveFolder: string;
	/** Tag-tree node paths that are currently collapsed. */
	collapsedTags: string[];
}

const DEFAULT_SETTINGS: BearModeSettings = {
	enableTheme: true,
	themePreset: "red-graphite",
	accentColor: "#e0484c",
	showInfoBar: true,
	wordsPerMinute: 200,
	showSnippets: true,
	noteSort: "modified",
	openSidebarOnStartup: false,
	pinned: [],
	archiveFolder: "Archive",
	collapsedTags: [],
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

		// The Bear-style tag + note-list sidebar.
		this.registerView(
			VIEW_TYPE_BEAR,
			(leaf) => new BearSidebarView(leaf, this)
		);
		this.addRibbonIcon("hash", "Open Bear sidebar", () =>
			this.activateView()
		);

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

		// Drop pins that point at notes which no longer exist.
		this.registerEvent(
			this.app.vault.on("delete", (file: TFile) => {
				const i = this.settings.pinned.indexOf(file.path);
				if (i >= 0) {
					this.settings.pinned.splice(i, 1);
					this.saveSettings();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file: TFile, oldPath: string) => {
				const i = this.settings.pinned.indexOf(oldPath);
				if (i >= 0) {
					this.settings.pinned[i] = file.path;
					this.saveSettings();
				}
			})
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

		this.addCommand({
			id: "open-bear-sidebar",
			name: "Open Bear sidebar",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "show-note-info",
			name: "Show note info",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) new NoteInfoModal(this.app, this, file).open();
				return true;
			},
		});

		this.app.workspace.onLayoutReady(() => {
			this.updateInfoBar();
			if (this.settings.openSidebarOnStartup) this.activateView();
		});
	}

	onunload() {
		document.body.removeClass(BODY_CLASS);
		document.body.style.removeProperty("--bear-accent");
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_BEAR)[0] ?? null;
		if (!leaf) {
			const left = workspace.getLeftLeaf(false);
			if (!left) return;
			await left.setViewState({ type: VIEW_TYPE_BEAR, active: true });
			leaf = left;
		}
		workspace.revealLeaf(leaf);
	}

	/** Re-render any open Bear sidebars (e.g. after a settings change). */
	refreshSidebar() {
		this.app.workspace
			.getLeavesOfType(VIEW_TYPE_BEAR)
			.forEach((leaf: WorkspaceLeaf) => {
				const view = leaf.view;
				if (view instanceof BearSidebarView) view.render();
			});
	}

	isPinned(path: string): boolean {
		return this.settings.pinned.includes(path);
	}

	async togglePin(path: string) {
		const i = this.settings.pinned.indexOf(path);
		if (i >= 0) this.settings.pinned.splice(i, 1);
		else this.settings.pinned.push(path);
		await this.saveSettings();
		this.refreshSidebar();
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

	/** Switch to a named Bear theme (updates the accent color). */
	applyThemePreset(id: string) {
		this.settings.themePreset = id;
		const theme = BEAR_THEMES.find((t) => t.id === id);
		if (theme && theme.accent) this.settings.accentColor = theme.accent;
		this.applyAccent();
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

/* ------------------------------------------------------------------ *
 * The Bear sidebar: a tag tree on top, a note list with previews below.
 * ------------------------------------------------------------------ */

class BearSidebarView extends ItemView {
	plugin: BearModePlugin;

	private tagsEl!: HTMLElement;
	private notesEl!: HTMLElement;

	private selectedTag: string | null = TAG_ALL;
	private query = "";
	private refreshTimer: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: BearModePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_BEAR;
	}

	getDisplayText(): string {
		return "Bear";
	}

	getIcon(): string {
		return "hash";
	}

	async onOpen() {
		this.contentEl.addClass("bear-sidebar");

		// Refresh when the vault or its metadata changes.
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("create", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("delete", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("rename", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.workspace.on("file-open", () => this.highlightActive())
		);

		this.render();
	}

	async onClose() {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
	}

	private scheduleRefresh() {
		if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
		this.refreshTimer = window.setTimeout(() => this.render(), 300);
	}

	/** Full rebuild of the sidebar. */
	render() {
		const root = this.contentEl;
		root.empty();

		// Header: title + compose button.
		const header = root.createDiv({ cls: "bear-header" });
		header.createDiv({ cls: "bear-header-title", text: "Bear" });
		const newBtn = header.createEl("button", {
			cls: "bear-new-note",
			text: "+",
		});
		newBtn.setAttr("aria-label", "New note");
		newBtn.addEventListener("click", () => this.createNote());

		// Search box.
		const search = root.createEl("input", {
			cls: "bear-search",
			attr: { type: "text", placeholder: "Search notes" },
		});
		search.value = this.query;
		search.addEventListener("input", () => {
			this.query = search.value;
			this.renderNotes();
		});

		this.tagsEl = root.createDiv({ cls: "bear-tags" });
		this.notesEl = root.createDiv({ cls: "bear-notes" });

		this.renderTags();
		this.renderNotes();
	}

	private renderTags() {
		const el = this.tagsEl;
		el.empty();

		const allFiles = this.app.vault.getMarkdownFiles() as TFile[];
		const active = allFiles.filter((f) => !this.isArchived(f));

		// Bear's smart sections.
		this.addSpecialRow(el, "All Notes", TAG_ALL, active.length, "files");
		this.addSpecialRow(
			el,
			"Today",
			TAG_TODAY,
			active.filter((f) => this.isToday(f)).length,
			"calendar"
		);
		this.addSpecialRow(
			el,
			"To Do",
			TAG_TODO,
			active.filter((f) => this.hasOpenTask(f)).length,
			"check-square"
		);
		this.addSpecialRow(
			el,
			"Untagged",
			TAG_UNTAGGED,
			active.filter((f) => this.fileTags(f).length === 0).length,
			"circle-dashed"
		);

		// Collapsible nested tag tree.
		const tree = buildTagTree(this.collectTagCounts());
		for (const node of tree) this.renderTagNode(el, node, 0);

		// Archive lives at the bottom, like Bear.
		this.addSpecialRow(
			el,
			"Archive",
			TAG_ARCHIVE,
			allFiles.length - active.length,
			"archive"
		);
	}

	private addSpecialRow(
		container: HTMLElement,
		label: string,
		tagValue: string | null,
		count: number,
		iconId: string
	) {
		const row = container.createDiv({ cls: "bear-tag-item" });
		if (this.selectedTag === tagValue) row.addClass("is-active");

		row.createSpan({ cls: "bear-tag-twisty is-leaf" });
		const icon = row.createSpan({ cls: "bear-tag-icon" });
		setIcon(icon, iconId);

		row.createSpan({ cls: "bear-tag-name", text: label });
		row.createSpan({ cls: "bear-tag-count", text: String(count) });

		row.addEventListener("click", () => {
			this.selectedTag = tagValue;
			this.render();
		});
	}

	private renderTagNode(
		container: HTMLElement,
		node: TagNode,
		depth: number
	) {
		const hasChildren = node.children.length > 0;
		const collapsed = this.plugin.settings.collapsedTags.includes(
			node.path
		);

		const row = container.createDiv({ cls: "bear-tag-item" });
		if (this.selectedTag === "#" + node.path) row.addClass("is-active");
		row.style.paddingLeft = 8 + depth * 14 + "px";

		const twisty = row.createSpan({ cls: "bear-tag-twisty" });
		if (hasChildren) {
			setIcon(twisty, collapsed ? "chevron-right" : "chevron-down");
			twisty.addEventListener("click", (e: MouseEvent) => {
				e.stopPropagation();
				this.toggleCollapse(node.path);
			});
		} else {
			twisty.addClass("is-leaf");
		}

		row.createSpan({ cls: "bear-tag-icon", text: "#" });
		row.createSpan({ cls: "bear-tag-name", text: node.name });
		row.createSpan({ cls: "bear-tag-count", text: String(node.count) });

		row.addEventListener("click", () => {
			this.selectedTag = "#" + node.path;
			this.render();
		});

		if (hasChildren && !collapsed) {
			for (const child of node.children) {
				this.renderTagNode(container, child, depth + 1);
			}
		}
	}

	private async toggleCollapse(path: string) {
		const arr = this.plugin.settings.collapsedTags;
		const i = arr.indexOf(path);
		if (i >= 0) arr.splice(i, 1);
		else arr.push(path);
		await this.plugin.saveSettings();
		this.renderTags();
	}

	private renderNotes() {
		const el = this.notesEl;
		el.empty();

		let files = this.app.vault.getMarkdownFiles() as TFile[];

		if (this.selectedTag === TAG_ARCHIVE) {
			files = files.filter((f) => this.isArchived(f));
		} else {
			// Every other view hides archived notes, like Bear.
			files = files.filter((f) => !this.isArchived(f));

			if (this.selectedTag === TAG_TODAY) {
				files = files.filter((f) => this.isToday(f));
			} else if (this.selectedTag === TAG_TODO) {
				files = files.filter((f) => this.hasOpenTask(f));
			} else if (this.selectedTag === TAG_UNTAGGED) {
				files = files.filter((f) => this.fileTags(f).length === 0);
			} else if (this.selectedTag && this.selectedTag.startsWith("#")) {
				const tag = this.selectedTag.slice(1);
				files = files.filter((f) =>
					this.fileTags(f).some(
						(t) => t === tag || t.startsWith(tag + "/")
					)
				);
			}
		}

		const q = this.query.trim().toLowerCase();
		if (q) {
			files = files.filter((f) => f.basename.toLowerCase().includes(q));
		}

		files = this.sortFiles(files).slice(0, 300);

		// List header: scope name + count + sort toggle.
		const scope = this.scopeName();
		const listHeader = el.createDiv({ cls: "bear-notes-header" });
		listHeader.createSpan({
			cls: "bear-notes-scope",
			text: `${scope} · ${files.length}`,
		});
		const sortBtn = listHeader.createSpan({ cls: "bear-sort-btn" });
		setIcon(sortBtn, "arrow-up-down");
		sortBtn.setAttr(
			"aria-label",
			`Sort by ${SORT_LABEL[this.plugin.settings.noteSort]}`
		);
		sortBtn.addEventListener("click", async () => {
			const order: NoteSort[] = ["modified", "created", "title"];
			const next =
				order[
					(order.indexOf(this.plugin.settings.noteSort) + 1) %
						order.length
				];
			this.plugin.settings.noteSort = next;
			await this.plugin.saveSettings();
			this.renderNotes();
		});

		const list = el.createDiv({ cls: "bear-notes-list" });

		if (files.length === 0) {
			list.createDiv({ cls: "bear-empty", text: "No notes" });
			return;
		}

		// Pinned notes float to the top, like Bear.
		const pinnedSet = new Set(this.plugin.settings.pinned);
		const pinned = files.filter((f) => pinnedSet.has(f.path));
		const others = files.filter((f) => !pinnedSet.has(f.path));

		if (pinned.length) {
			list.createDiv({ cls: "bear-list-section", text: "Pinned" });
			for (const f of pinned) this.renderNoteItem(list, f, true);
			if (others.length)
				list.createDiv({ cls: "bear-list-divider" });
		}
		for (const f of others) this.renderNoteItem(list, f, false);
	}

	private renderNoteItem(
		container: HTMLElement,
		file: TFile,
		pinned: boolean
	) {
		const item = container.createDiv({ cls: "bear-note-item" });
		item.dataset.path = file.path;
		const active = this.app.workspace.getActiveFile();
		if (active && active.path === file.path) item.addClass("is-active");

		const titleRow = item.createDiv({ cls: "bear-note-title-row" });
		if (pinned) {
			const pin = titleRow.createSpan({ cls: "bear-pin-icon" });
			setIcon(pin, "pin");
		}
		titleRow.createSpan({ cls: "bear-note-title", text: file.basename });

		if (this.plugin.settings.showSnippets) {
			const snippetEl = item.createDiv({ cls: "bear-note-snippet" });
			this.app.vault.cachedRead(file).then((content: string) => {
				snippetEl.setText(makeSnippet(content, file.basename));
			});
		}

		item.createDiv({
			cls: "bear-note-meta",
			text: formatDate(file.stat.mtime),
		});

		item.addEventListener("click", () => this.openNote(file));
		item.addEventListener("contextmenu", (evt: MouseEvent) =>
			this.showNoteMenu(evt, file)
		);
	}

	private showNoteMenu(evt: MouseEvent, file: TFile) {
		evt.preventDefault();
		const menu = new Menu();
		const isPinned = this.plugin.isPinned(file.path);

		menu.addItem((i: any) =>
			i
				.setTitle(isPinned ? "Unpin" : "Pin to top")
				.setIcon("pin")
				.onClick(() => this.plugin.togglePin(file.path))
		);
		menu.addItem((i: any) =>
			i
				.setTitle("Open in new tab")
				.setIcon("file-plus")
				.onClick(async () => {
					const leaf = this.app.workspace.getLeaf("tab");
					await leaf.openFile(file);
				})
		);
		menu.addItem((i: any) =>
			i
				.setTitle(this.isArchived(file) ? "Unarchive" : "Archive")
				.setIcon("archive")
				.onClick(() => this.toggleArchive(file))
		);
		menu.addSeparator();
		menu.addItem((i: any) =>
			i
				.setTitle("Rename")
				.setIcon("pencil")
				.onClick(() => new RenameModal(this.app, file).open())
		);
		menu.addItem((i: any) =>
			i
				.setTitle("Delete")
				.setIcon("trash")
				.onClick(async () => {
					await this.app.fileManager.trashFile(file);
					this.scheduleRefresh();
				})
		);
		menu.showAtMouseEvent(evt);
	}

	private highlightActive() {
		if (!this.notesEl) return;
		const active = this.app.workspace.getActiveFile();
		this.notesEl
			.querySelectorAll(".bear-note-item")
			.forEach((node: Element) => {
				const item = node as HTMLElement;
				item.toggleClass(
					"is-active",
					!!active && item.dataset.path === active.path
				);
			});
	}

	private sortFiles(files: TFile[]): TFile[] {
		const arr = files.slice();
		switch (this.plugin.settings.noteSort) {
			case "title":
				arr.sort((a, b) => a.basename.localeCompare(b.basename));
				break;
			case "created":
				arr.sort((a, b) => b.stat.ctime - a.stat.ctime);
				break;
			default:
				arr.sort((a, b) => b.stat.mtime - a.stat.mtime);
		}
		return arr;
	}

	private scopeName(): string {
		switch (this.selectedTag) {
			case TAG_ALL:
				return "All Notes";
			case TAG_TODAY:
				return "Today";
			case TAG_TODO:
				return "To Do";
			case TAG_UNTAGGED:
				return "Untagged";
			case TAG_ARCHIVE:
				return "Archive";
			default:
				return (this.selectedTag as string).replace(/^#/, "");
		}
	}

	private isArchived(file: TFile): boolean {
		const folder = this.plugin.settings.archiveFolder.trim();
		if (!folder) return false;
		return file.path.startsWith(folder + "/");
	}

	private isToday(file: TFile): boolean {
		return (
			new Date(file.stat.mtime).toDateString() ===
			new Date().toDateString()
		);
	}

	private hasOpenTask(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		const items = cache && cache.listItems;
		if (!items) return false;
		return items.some((it: any) => it.task === " ");
	}

	private async toggleArchive(file: TFile) {
		const folder = this.plugin.settings.archiveFolder.trim() || "Archive";
		try {
			if (this.isArchived(file)) {
				await this.app.fileManager.renameFile(file, file.name);
			} else {
				if (!this.app.vault.getAbstractFileByPath(folder)) {
					await this.app.vault.createFolder(folder);
				}
				await this.app.fileManager.renameFile(
					file,
					folder + "/" + file.name
				);
			}
		} catch (e) {
			/* destination exists or is invalid — leave the note in place */
		}
		this.scheduleRefresh();
	}

	/** Tags (without the leading #), deduplicated, for a single file. */
	private fileTags(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return [];
		const all = getAllTags(cache) || [];
		const set = new Set<string>();
		for (const t of all) set.add(t.replace(/^#/, ""));
		return Array.from(set);
	}

	/**
	 * Count, for every tag node (including intermediate parents like `work`
	 * in `work/projects`), how many notes carry that node or a descendant.
	 */
	private collectTagCounts(): Map<string, number> {
		const counts = new Map<string, number>();
		const files = (this.app.vault.getMarkdownFiles() as TFile[]).filter(
			(f) => !this.isArchived(f)
		);

		for (const file of files) {
			const nodes = new Set<string>();
			for (const tag of this.fileTags(file)) {
				let acc = "";
				for (const part of tag.split("/")) {
					acc = acc ? acc + "/" + part : part;
					nodes.add(acc);
				}
			}
			for (const node of nodes) {
				counts.set(node, (counts.get(node) || 0) + 1);
			}
		}
		return counts;
	}

	private async openNote(file: TFile) {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		this.highlightActive();
	}

	private async createNote() {
		const base = "Untitled";
		let name = base;
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(name + ".md")) {
			name = `${base} ${i++}`;
		}

		// Bear seeds a new note with the currently selected tag.
		let body = "";
		if (this.selectedTag && this.selectedTag.startsWith("#")) {
			body = this.selectedTag + "\n\n";
		}

		const file = (await this.app.vault.create(
			name + ".md",
			body
		)) as TFile;
		await this.openNote(file);
		this.scheduleRefresh();
	}
}

/* --------------------------- rename modal --------------------------- */

class RenameModal extends Modal {
	private file: TFile;

	constructor(app: App, file: TFile) {
		super(app);
		this.file = file;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("bear-rename-modal");
		contentEl.createEl("h3", { text: "Rename note" });

		const input = contentEl.createEl("input", {
			cls: "bear-rename-input",
			attr: { type: "text" },
		});
		input.value = this.file.basename;
		input.focus();
		input.select();

		const submit = async () => {
			const name = input.value.trim();
			if (name && name !== this.file.basename) {
				const parent = this.file.parent;
				const dir =
					parent && parent.path && parent.path !== "/"
						? parent.path + "/"
						: "";
				try {
					await this.app.fileManager.renameFile(
						this.file,
						dir + name + ".md"
					);
				} catch (e) {
					/* name clash or invalid characters — leave as-is */
				}
			}
			this.close();
		};

		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") submit();
			if (e.key === "Escape") this.close();
		});

		const actions = contentEl.createDiv({ cls: "bear-rename-actions" });
		const btn = actions.createEl("button", {
			cls: "mod-cta",
			text: "Rename",
		});
		btn.addEventListener("click", submit);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/* ----------------------- note info modal ----------------------- */

class NoteInfoModal extends Modal {
	private plugin: BearModePlugin;
	private file: TFile;

	constructor(app: App, plugin: BearModePlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.addClass("bear-info-modal");
		contentEl.createEl("h3", { text: this.file.basename });

		const content: string = await this.app.vault.cachedRead(this.file);

		let body = content;
		if (body.startsWith("---")) {
			const end = body.indexOf("\n---", 3);
			if (end !== -1) body = body.slice(end + 4);
		}

		const words = (body.match(/[\p{L}\p{N}'’\-]+/gu) || []).length;
		const characters = body.length;
		const paragraphs = body
			.split(/\n\s*\n/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0).length;
		const minutes = Math.max(
			1,
			Math.round(words / Math.max(1, this.plugin.settings.wordsPerMinute))
		);

		const cache = this.app.metadataCache.getFileCache(this.file);
		const tags: string[] = (cache && getAllTags(cache)) || [];

		const list = contentEl.createDiv({ cls: "bear-info-list" });
		const row = (label: string, value: string) => {
			const r = list.createDiv({ cls: "bear-info-row" });
			r.createSpan({ cls: "bear-info-label", text: label });
			r.createSpan({ cls: "bear-info-value", text: value });
		};

		row("Words", words.toLocaleString());
		row("Characters", characters.toLocaleString());
		row("Paragraphs", paragraphs.toLocaleString());
		row("Reading time", `${minutes} min`);
		row("Created", new Date(this.file.stat.ctime).toLocaleString());
		row("Modified", new Date(this.file.stat.mtime).toLocaleString());
		if (tags.length) row("Tags", tags.join("  "));
	}

	onClose() {
		this.contentEl.empty();
	}
}

/* --------------------------- helpers --------------------------- */

interface TagNode {
	path: string;
	name: string;
	count: number;
	children: TagNode[];
}

/** Turn a flat map of tag paths -> counts into a nested tree. */
function buildTagTree(counts: Map<string, number>): TagNode[] {
	const nodes = new Map<string, TagNode>();
	for (const [path, count] of counts) {
		nodes.set(path, {
			path,
			name: path.split("/").pop() as string,
			count,
			children: [],
		});
	}

	const roots: TagNode[] = [];
	for (const path of Array.from(nodes.keys()).sort()) {
		const node = nodes.get(path) as TagNode;
		const idx = path.lastIndexOf("/");
		if (idx === -1) {
			roots.push(node);
		} else {
			const parent = nodes.get(path.slice(0, idx));
			if (parent) parent.children.push(node);
			else roots.push(node);
		}
	}
	return roots;
}

function plural(n: number, noun: string): string {
	return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

/** First meaningful line of body text, stripped of markdown noise. */
function makeSnippet(content: string, title: string): string {
	let body = content;

	// Drop YAML frontmatter.
	if (body.startsWith("---")) {
		const end = body.indexOf("\n---", 3);
		if (end !== -1) body = body.slice(end + 4);
	}

	const lines = body
		.split("\n")
		.map((l) =>
			l
				.replace(/^#+\s*/, "") // heading markers
				.replace(/^[>\-*+]\s*/, "") // quote / list markers
				.replace(/^\s*\[[ xX]\]\s*/, "") // task checkboxes
				.replace(/[`*_~]/g, "") // inline emphasis / code
				.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links / images -> text
				.trim()
		)
		.filter((l) => l.length > 0 && l !== title);

	return (lines[0] || "No additional text").slice(0, 120);
}

/** Bear-style date: a time for today, "Yesterday", otherwise a short date. */
function formatDate(ts: number): string {
	const d = new Date(ts);
	const now = new Date();

	if (d.toDateString() === now.toDateString()) {
		return d.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});
	}

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

	const sameYear = d.getFullYear() === now.getFullYear();
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

/* --------------------------- settings --------------------------- */

class BearModeSettingTab extends PluginSettingTab {
	plugin: BearModePlugin;

	constructor(app: App, plugin: BearModePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Appearance").setHeading();

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
			.setName("Color theme")
			.setDesc(
				"Bear's signature color themes. Pick Custom to choose your own accent below."
			)
			.addDropdown((dropdown) => {
				for (const theme of BEAR_THEMES) {
					dropdown.addOption(theme.id, theme.name);
				}
				dropdown
					.setValue(this.plugin.settings.themePreset)
					.onChange(async (id: string) => {
						this.plugin.applyThemePreset(id);
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName("Accent color")
			.setDesc(
				"The single accent color used across the UI (sets the theme to Custom)."
			)
			.addColorPicker((picker) =>
				picker
					.setValue(this.plugin.settings.accentColor)
					.onChange(async (value) => {
						this.plugin.settings.accentColor = value;
						this.plugin.settings.themePreset = "custom";
						await this.plugin.saveSettings();
						this.plugin.applyAccent();
					})
			);

		new Setting(containerEl).setName("Sidebar").setHeading();

		new Setting(containerEl)
			.setName("Note previews")
			.setDesc("Show a one-line body preview under each note.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSnippets)
					.onChange(async (value) => {
						this.plugin.settings.showSnippets = value;
						await this.plugin.saveSettings();
						this.plugin.refreshSidebar();
					})
			);

		new Setting(containerEl)
			.setName("Sort notes by")
			.setDesc("How the note list is ordered.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("modified", "Modified date")
					.addOption("created", "Created date")
					.addOption("title", "Title")
					.setValue(this.plugin.settings.noteSort)
					.onChange(async (value: NoteSort) => {
						this.plugin.settings.noteSort = value;
						await this.plugin.saveSettings();
						this.plugin.refreshSidebar();
					})
			);

		new Setting(containerEl)
			.setName("Archive folder")
			.setDesc(
				"Notes moved here are hidden from every view except Archive."
			)
			.addText((text) =>
				text
					.setPlaceholder("Archive")
					.setValue(this.plugin.settings.archiveFolder)
					.onChange(async (value) => {
						this.plugin.settings.archiveFolder = value;
						await this.plugin.saveSettings();
						this.plugin.refreshSidebar();
					})
			);

		new Setting(containerEl)
			.setName("Open sidebar on startup")
			.setDesc(
				"Reveal the Bear sidebar automatically when Obsidian starts."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openSidebarOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.openSidebarOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Status bar").setHeading();

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
