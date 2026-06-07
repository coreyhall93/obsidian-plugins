# Bear Mode — Project Runbook

> **What this is:** an Obsidian plugin that turns Obsidian into a clone of the
> [Bear](https://bear.app) notes app. This document is the single place to
> understand the project, build it, install it, and pick the work back up later.

- **Status:** working plugin, **v1.3.0**. Builds clean; **not yet runtime-tested inside Obsidian** (see [Known limitations](#known-limitations--untested-areas)).
- **Repo:** `coreyhall93/obsidian-plugins`
- **Working branch:** `claude/obsidian-plugin-bLKrF`
- **Plugin location in repo:** `bear-mode/`
- **Local vault ("Sol"):** `/Users/coreyhall/Sol`

---

## 1. Quick start (on your Mac)

```bash
# 1. Get the latest code
cd ~/path/to/obsidian-plugins          # wherever you cloned it
git fetch origin
git checkout claude/obsidian-plugin-bLKrF
git pull origin claude/obsidian-plugin-bLKrF

# 2. Install the plugin into the Sol vault
mkdir -p "/Users/coreyhall/Sol/.obsidian/plugins/bear-mode"
cp bear-mode/main.js bear-mode/manifest.json bear-mode/styles.css \
   "/Users/coreyhall/Sol/.obsidian/plugins/bear-mode/"

# 3. (Optional) keep a copy of this runbook in the vault
cp RUNBOOK.md "/Users/coreyhall/Sol/Bear Mode Runbook.md"
```

Then in Obsidian: **Settings → Community plugins → enable "Bear Mode"**.
(If community plugins are off, toggle off *Restricted mode* / *Safe mode* first.)

Open the Bear sidebar from the **`#` ribbon icon** or the command palette
(*Bear Mode: Open Bear sidebar*).

---

## 2. What was built (feature inventory)

Bear Mode recreates Bear's app experience inside Obsidian.

### The Bear sidebar (custom `ItemView`)
- **Smart sections:** All Notes · Today · To Do · Untagged · Archive
  - *Today* = notes whose modified time is today
  - *To Do* = notes containing an unchecked task (`- [ ]`), detected from
    `metadataCache` list items (no file scanning)
- **Collapsible nested tag tree** — `#parent/child` tags nest with disclosure
  triangles; collapsed branches are remembered in settings
- **Note list with previews** — title, one-line body snippet, and a Bear-style
  date (a time today / "Yesterday" / short date)
- **Pinned notes** float to the top under a *Pinned* heading
- **Right-click context menu:** Pin/Unpin · Open in new tab ·
  Archive/Unarchive · Rename (inline modal) · Delete (moves to trash)
- **Search box** filters the current section by title
- **Note-list header** shows scope + count, with a one-click sort toggle
  (modified → created → title)
- **Compose `+` button** creates a new note, pre-seeded with the selected tag
- Live refresh on vault/metadata changes (debounced 300 ms); highlights the
  active note

### Look & feel (theme, gated behind `body.bear-mode-enabled`)
- **Named Bear color themes:** Red Graphite, Charcoal, Solarized, Gotham,
  Toothpaste, Cobalt, Dracula, Panic Mode — plus a **Custom** accent picker
- A single accent color drives the whole UI (headings, links, tags, checkboxes,
  selection) via Obsidian's CSS variables
- Clean typography, centered ~720px reading column, **tag pills**, accent
  task-list checkboxes (with strikethrough), accent blockquote rules, rounded
  inline code & code blocks, soft divider rules, rounded tables w/ accent header

### Other
- **Note info panel** — *Show note info* command opens a modal with words,
  characters, paragraphs, reading time, created/modified dates, and tags
- **Status-bar info bar** — `words · characters · min read`, updates live
- **Toggle command** — *Toggle Bear theme* flips styling without disabling the plugin

### Settings tab
Bear theme on/off · Color theme · Accent color · Note previews · Sort notes by ·
Archive folder · Open sidebar on startup · Info bar · Reading speed.

---

## 3. Codebase tour

```
bear-mode/
├── main.ts            # all plugin logic (source of truth)
├── main.js            # COMMITTED prebuilt bundle (what Obsidian loads)
├── styles.css         # all styling (theme + sidebar + modals)
├── manifest.json      # plugin id/name/version/minAppVersion
├── versions.json      # plugin-version -> min-Obsidian-version map
├── package.json       # npm scripts + devDeps (esbuild, typescript, obsidian)
├── esbuild.config.mjs # standard Obsidian esbuild bundler config
├── tsconfig.json      # TS config for the normal esbuild build
├── version-bump.mjs   # bumps manifest.json + versions.json on `npm version`
└── README.md          # user-facing feature docs
```

### `main.ts` structure (read in this order)
- **`BearModeSettings` / `DEFAULT_SETTINGS`** — persisted settings shape.
- **`BEAR_THEMES`** — named themes (id, display name, accent hex).
- **`BearModePlugin`** (default export) — lifecycle:
  - `onload()` — status bar, theme/accent, registers the view, ribbon icon,
    settings tab, workspace event listeners (info bar + pin housekeeping on
    rename/delete), and commands (toggle theme, open sidebar, show note info).
  - `activateView()` — reveals the sidebar in the left split.
  - `refreshSidebar()` — re-renders open sidebars after settings changes.
  - `isPinned()/togglePin()`, `applyTheme()/applyAccent()/applyThemePreset()`,
    `updateInfoBar()`, `loadSettings()/saveSettings()`.
- **`BearSidebarView extends ItemView`** — the sidebar UI:
  - `render()` rebuilds everything; `renderTags()` (specials + tree),
    `renderNotes()` (header + filtered/sorted/pinned list).
  - Filtering helpers: `isArchived`, `isToday`, `hasOpenTask`, `fileTags`,
    `collectTagCounts`, `scopeName`.
  - Actions: `openNote`, `createNote`, `toggleArchive`, `toggleCollapse`,
    `showNoteMenu` (right-click), `highlightActive`.
- **`RenameModal`**, **`NoteInfoModal`** — small `Modal` subclasses.
- **Helpers:** `buildTagTree` (flat path→count map ⇒ nested `TagNode[]`),
  `plural`, `makeSnippet`, `formatDate`.
- **`BearModeSettingTab`** — the settings UI.

### `styles.css`
- Theme rules scoped under `body.bear-mode-enabled` (so the *Toggle Bear theme*
  command cleanly turns them off).
- Sidebar rules under `.bear-sidebar` are **not** gated — the sidebar always
  looks like Bear when open.
- Uses `color-mix(in srgb, var(--bear-accent) …)` for tints (needs a recent
  Chromium, which Obsidian ships).

---

## 4. Building

### Standard path (on a machine with npm registry access)
```bash
cd bear-mode
npm install
npm run dev      # esbuild watch mode (rebuilds main.js on save)
npm run build    # type-check + minified production main.js
```
This is the normal Obsidian plugin toolchain (esbuild bundles `main.ts` → `main.js`,
marking `obsidian` and CodeMirror packages as external).

### ⚠️ How the committed `main.js` was actually produced (important context)
The cloud dev environment this was built in has the **npm registry blocked**, so
`npm install` fails (403) and neither `esbuild` nor the `obsidian` type package
could be installed. To still ship a working bundle, `main.js` was produced by
transpiling with the **globally available `tsc`** plus a temporary, build-only
ambient shim that declares the `obsidian` module and Obsidian's DOM helpers:

```bash
# (temporary files, deleted after building — not committed)
#   obsidian-shim.d.ts   -> declare module "obsidian" + HTMLElement augmentations
#   tsconfig.build.json  -> module CommonJS, target ES2018, noEmitOnError:false
tsc -p tsconfig.build.json
# then a generated-file banner is prepended to main.js
```
The output is a valid CommonJS module (`require("obsidian")` external,
`exports.default = BearModePlugin`) — functionally equivalent to the esbuild
bundle for runtime purposes. **`main.js` is committed** (the repo's `.gitignore`
intentionally tracks it) so the plugin installs without a build step.

> When you next have registry access, prefer `npm run build` (esbuild) to
> regenerate `main.js` the standard way. The committed file will be overwritten.

---

## 5. Known limitations & untested areas

- **NOT runtime-tested in Obsidian.** The sandbox can't launch the app, so the
  runtime-only surfaces below were written against the documented API and
  statically checked, but not exercised live. Verify these first when you pick
  it up:
  - `ItemView` lifecycle + `contentEl`, `WorkspaceLeaf.setViewState`,
    `workspace.getLeftLeaf`/`revealLeaf`
  - `Menu` / `Modal` usage
  - `fileManager.renameFile` (rename + archive) and `fileManager.trashFile`
  - `metadataCache.getFileCache().listItems[].task` for To-Do detection
  - `getAllTags`, `vault.cachedRead`, `vault.createFolder`
  - Lucide icon names used by `setIcon` (`files`, `calendar`, `check-square`,
    `circle-dashed`, `archive`, `chevron-right/down`, `hash`, `pin`,
    `file-plus`, `pencil`, `trash`, `arrow-up-down`) — a wrong name renders
    nothing, not a crash.
- **Single stacked pane**, not true three side-by-side panes. Bear's tag pane +
  note-list pane are stacked vertically inside one Obsidian sidebar leaf.
- **Out of scope** (not feasible as an Obsidian plugin): Bear's encrypted notes,
  proprietary sync, PDF/JPG export, sketches.

---

## 6. Roadmap / next ideas
- Verify in Obsidian and fix any runtime issues (top priority).
- Side-by-side note-list pane (closer to Bear's 3-pane layout).
- Drag-to-pin / reorder pins; a dedicated *Trash* section.
- "Use first line as note title" option (Bear titles from the first line).
- Tag rename/merge from the sidebar; per-tag note counts excluding descendants.
- Submit to the Obsidian community plugin directory (needs a clean esbuild
  build, a LICENSE file, and a release with `manifest.json` + `main.js` +
  `styles.css` attached).

---

## 7. Git workflow
- Develop on **`claude/obsidian-plugin-bLKrF`**; commit with descriptive messages;
  push with `git push -u origin claude/obsidian-plugin-bLKrF`.
- Bump `manifest.json` **and** `versions.json` together when releasing
  (`npm version` runs `version-bump.mjs` to do this).
- No PR has been opened yet (none was requested).

### Commit history so far
| Version | Commit | Summary |
| --- | --- | --- |
| 1.0.0 | `832b526` | Initial plugin: theme, accent, tag pills, status-bar info bar |
| 1.1.0 | `e29c0ee` | Bear sidebar: tag tree + note list with previews |
| 1.2.0 | `74b5d14` | Pinned notes, right-click menu, named themes, richer typography |
| 1.3.0 | `768fd64` | Smart sections (Today/To Do/Archive), collapsible tag tree, archive, note info panel |

---

## 8. Environment notes (for future cloud sessions)
- This was built via Claude Code in a remote, ephemeral Linux container — commit
  & push anything worth keeping; the container is reclaimed after inactivity.
- **npm registry is blocked** in that environment (see §4). Global tools present:
  `node` v22, `tsc` (TypeScript), `ts-node`, `prettier`, `eslint`,
  `playwright`/`chromedriver` (but no Obsidian to drive).
- The container is **Linux**; the Sol vault (`/Users/coreyhall/Sol`) is on your
  local Mac and is **not reachable** from the container — copy files locally
  after pulling, as in §1.
