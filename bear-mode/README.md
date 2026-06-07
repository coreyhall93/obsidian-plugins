# Bear Mode

An Obsidian plugin that makes Obsidian **look, feel, and function like [Bear](https://bear.app)** — Bear's clean typography, its single signature accent color used everywhere, tags rendered as rounded pills, and the familiar footer showing word count, character count, and reading time.

This is a deliberately **minimal** plugin: it leans on Obsidian's own theming variables so it stays fast, theme-friendly, and easy to extend.

## Features

- **Bear sidebar** — a dedicated pane with Bear's signature layout: smart sections (**All Notes, Today, To Do, Untagged, Archive**) and a **collapsible nested tag tree**, with a **note list with previews** below. Each note shows its title, a one-line body snippet, and a Bear-style date (a time today, "Yesterday", or a short date). Open it from the ribbon (`#` icon) or the *Open Bear sidebar* command.
  - **Smart sections** — *Today* (notes touched today), *To Do* (notes with unchecked tasks), *Untagged*, and *Archive*.
  - **Collapsible tag tree** — `#parent/child` tags nest; click the disclosure triangle to collapse or expand a branch. Collapsed state is remembered.
  - **Click a tag/section** to filter the list; **click a note** to open it. The list highlights the active note and updates live as the vault changes.
  - **Note-list header** shows the current scope and note count, with a one-click button to cycle the sort order.
  - **Pinned notes** float to the top under a *Pinned* heading, just like Bear.
  - **Right-click a note** for a context menu: *Pin / Unpin*, *Open in new tab*, *Archive / Unarchive*, *Rename* (inline dialog), and *Delete* (moves to trash).
  - **Search** notes by title within the current section.
  - **Compose button** (`+`) creates a new note, pre-seeded with the selected tag — just like Bear.
- **Note info panel** — the *Show note info* command opens a Bear-style panel with words, characters, paragraphs, reading time, created/modified dates, and tags for the active note.
- **Named Bear color themes** — pick from Bear's signature themes (Red Graphite, Charcoal, Solarized, Gotham, Toothpaste, Cobalt, Dracula, Panic Mode), or choose **Custom** and set your own accent.
- **One accent color, everywhere** — like Bear, a single color drives headings, links, tags, checkboxes, and text selection.
- **Bear typography** — a comfortable reading column, generous line height, a clean font stack, accent-colored headings, tag **pills**, accent task-list checkboxes, accent blockquote rules, rounded code blocks, soft dividers, and rounded tables with an accent header.
- **Info bar** — a Bear-style `123 words · 678 characters · 3 min read` readout lives in the status bar and updates as you type.
- **Toggle command** — "Bear Mode: Toggle Bear theme" flips the styling on/off without disabling the plugin.

## Settings

| Setting | What it does |
| --- | --- |
| **Bear theme** | Turns the Bear styling on or off. |
| **Color theme** | Pick a named Bear theme, or Custom. |
| **Accent color** | The single accent used across the UI (sets the theme to Custom). |
| **Note previews** | Shows/hides the one-line body snippet under each note. |
| **Sort notes by** | Order the note list by modified date, created date, or title. |
| **Archive folder** | Folder used for archived notes (hidden from every view except Archive). |
| **Open sidebar on startup** | Reveal the Bear sidebar automatically when Obsidian starts. |
| **Info bar** | Shows/hides the word · character · reading-time readout. |
| **Reading speed** | Words per minute used to estimate the "min read" figure. |

## Installing manually

1. Run `npm install` then `npm run build` in this folder to produce `main.js`.
2. Copy `main.js`, `manifest.json`, and `styles.css` into
   `<your vault>/.obsidian/plugins/bear-mode/`.
3. Reload Obsidian and enable **Bear Mode** under *Settings → Community plugins*.

## Developing

```bash
npm install      # install dependencies
npm run dev      # rebuild on change (watch mode)
npm run build    # type-check + production build
```

## License

MIT
