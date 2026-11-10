<p align="center"><img src="src-tauri/icons/icon.png" width="96" alt="Inkmark"></p>

<h1 align="center">Inkmark</h1>

<p align="center">A local Markdown viewer &amp; editor · Windows 10 / 11 x64</p>

<p align="center">
  <a href="https://github.com/yataome1/inkmark/actions/workflows/ci.yml"><img src="https://github.com/yataome1/inkmark/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

<p align="center"><a href="README.md">简体中文</a> | English</p>

> The user interface, the built-in user guide and the other project documents (CONTRIBUTING, SECURITY, specs) are in Simplified Chinese.

## Features

- **Live preview**: text is formatted as you type, and the Markdown markup appears where the cursor is; `Ctrl+/` switches to source mode
- **Full syntax**: GFM tables, task lists, strikethrough, footnotes, `[TOC]`, ==highlight==, KaTeX math, Mermaid diagrams, code highlighting
- **Small**: the installer is under 10 MB and uses the WebView2 runtime built into Windows
- **Fully offline**: all rendering resources ship with the app; no network requests, no telemetry
- **Tabs**: open several files at once, reorder by dragging, context menu, save all, restore last session's tabs on startup; a start page when no document is open
- **Tables**: size picker, toolbar, context menu, shortcuts, drag rows and columns
- **Sidebar**: outline, file tree and favorites, with an adjustable width
- **Focused writing**: focus mode (F8), typewriter mode (F9), full screen (F11), live word count
- **Themes**: light / dark / follow system
- **Images**: pasted or dropped images are stored in one image folder, so moving a document never breaks its images; put the image folder on a synced drive and images are found again on another computer; export a copy with images for sharing
- **Find & replace**, **HTML / PDF export**, recent files, `.md` file association, `Ctrl+click` to open links
- **Context menus**: commands for the editor, links, math and diagrams, such as copying the LaTeX source or copying a diagram as an image
- **Help**: built-in offline user guide, keyboard shortcut list (`F1`), copyable version information, complete third-party notices
- **No data loss**: unsaved-changes prompts and atomic writes; opening and saving a file changes no bytes you did not edit; undo is instant and only affects what changed; pressing browser shortcuts such as `F5` never reloads the window

## Installation

Download from [Releases](https://github.com/yataome1/inkmark/releases):

- `Inkmark-Setup-x.y.z-x64.exe` — installer (registers the `.md` file association)
- `Inkmark-x.y.z-x64-portable.exe` — portable, a single file that runs without installation

System requirements:

- 64-bit Windows 10 or Windows 11 (currently tested on Windows 11); Windows 7, 8 and 32-bit systems are not supported
- WebView2 runtime: built into Windows 11 and usually installed with Edge on Windows 10; if it is missing, the installer downloads it

> The installer is not code-signed. On first run Windows SmartScreen may show "Unknown publisher"; choose "Run anyway".

## Keyboard shortcuts

Common shortcuts are listed below; press `F1` in the app to see all of them.

| Action | Shortcut |
|---|---|
| New / Open / Save | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Source mode | `Ctrl+/` |
| Find / Replace | `Ctrl+F` / `Ctrl+H` |
| Close tab / Switch tab | `Ctrl+W` / `Ctrl+Tab` |
| All shortcuts | `F1` |

## Building from source

Requires Node.js, Rust (MSVC) and the Visual Studio C++ build tools; see [CONTRIBUTING.md](CONTRIBUTING.md) (in Chinese).

```bash
npm install
npm start        # run in development
npm test         # unit tests
npm run dist     # build the installer and the portable version
```

## Project structure

```
├── .github/                 CI workflow, issue / PR templates
├── .specify/                SDD: project constitution and spec templates
├── specs/                   SDD: spec / plan / research / tasks / checklist for each feature
├── scripts/                 build scripts (generate third-party resources in src/vendor)
├── resources/samples/       user guide and sample document compiled into the app
├── src/                     frontend: UI and editor (CodeMirror 6); platform.js is the only system interface
├── src-tauri/               backend (Rust): windows, menus, files, settings, PDF export; permissions and icons
├── test/                    frontend unit tests (node --test)
├── AGENTS.md                development rules for everyone (humans and AI assistants)
└── CONTRIBUTING.md          contribution guide
```

## How it is developed

The project follows **Spec-Driven Development**: each feature starts with a spec ([example](specs/001-inkmark-mvp/spec.md)), followed by a technical plan and a task list, and is then implemented and verified against its acceptance scenarios. All rules are in the [project constitution](.specify/memory/constitution.md) and [AGENTS.md](AGENTS.md).

## Acknowledgements

- [leoshone](https://github.com/leoshone)
- [CodeMirror 6](https://codemirror.net/) (MIT)
- [markdown-it](https://github.com/markdown-it/markdown-it) (MIT), [KaTeX](https://katex.org/) (MIT), [Mermaid](https://mermaid.js.org/) (MIT), [highlight.js](https://highlightjs.org/) (BSD-3-Clause)
- [Tauri](https://tauri.app/) (MIT / Apache-2.0)
- Design inspired by [Typora](https://typora.io). Inkmark is an independent open-source project and is not affiliated with Typora.

## License

[MIT](LICENSE)
