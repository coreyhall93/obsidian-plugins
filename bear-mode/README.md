# Bear Mode

An Obsidian plugin that makes Obsidian **look, feel, and function like [Bear](https://bear.app)** — Bear's clean typography, its single signature accent color used everywhere, tags rendered as rounded pills, and the familiar footer showing word count, character count, and reading time.

This is a deliberately **minimal** plugin: it leans on Obsidian's own theming variables so it stays fast, theme-friendly, and easy to extend.

## Features

- **Bear typography** — a comfortable reading column, generous line height, and a clean system font stack.
- **One accent color, everywhere** — like Bear, a single color drives headings, links, tags, checkboxes, and text selection. Pick your own in settings (defaults to Bear's classic red).
- **Tag pills** — `#tags` render as soft, rounded, accent-colored pills in both editing and reading views.
- **Info bar** — a Bear-style `123 words · 678 characters · 3 min read` readout lives in the status bar and updates as you type.
- **Toggle command** — "Bear Mode: Toggle Bear theme" flips the styling on/off without disabling the plugin.

## Settings

| Setting | What it does |
| --- | --- |
| **Bear theme** | Turns the Bear styling on or off. |
| **Accent color** | The single accent used across the UI. |
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
