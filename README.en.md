<p align="center"><img src="src-tauri/icons/icon.png" width="96" alt="Inkmark"></p>

<h1 align="center">Inkmark</h1>

<p align="center">A local Markdown viewer &amp; editor · Windows 10 / 11 x64 · macOS 12+</p>

<p align="center">
  <a href="https://github.com/yataome1/inkmark/actions/workflows/ci.yml"><img src="https://github.com/yataome1/inkmark/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

<p align="center"><a href="README.md">简体中文</a> | English</p>

> The user interface, the built-in user guide and the other project documents (CONTRIBUTING, SECURITY, specs) are in Simplified Chinese.

## Features

- **Live preview**: text is formatted as you type, and the Markdown markup appears where the cursor is; `Ctrl+/` switches to source mode
- **Full syntax**: GFM tables, task lists, strikethrough, footnotes, `[TOC]`, ==highlight==, KaTeX math, Mermaid diagrams, code highlighting
- **Small**: the installer is under 10 MB and uses the system web engine (WebView2 on Windows, WebKit on macOS)
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
- `Inkmark-x.y.z-universal.dmg` — macOS, for both Apple silicon and Intel Macs

Windows system requirements:

- 64-bit Windows 10 or Windows 11 (currently tested on Windows 11); Windows 7, 8 and 32-bit systems are not supported
- WebView2 runtime: built into Windows 11 and usually installed with Edge on Windows 10; if it is missing, the installer downloads it

> The installer is not code-signed. On first run Windows SmartScreen may show "Unknown publisher"; choose "Run anyway".

macOS:

- macOS 12 Monterey or later; open the `.dmg` and drag Inkmark to Applications
- The app is not signed or notarized by Apple, so the first launch says the developer cannot be verified: close the message, then click "Open Anyway" in System Settings > Privacy & Security. On macOS 12–14 you can also Control-click Inkmark and choose "Open". You are only asked once

### Verifying downloads

The installers are not code-signed. Before allowing one to run for the first time, you can verify the download (releases after 0.9.0):

- **Checksum**: each installer has a matching `.sha256` file. Download both into the same folder, then:
  - macOS (Terminal): `shasum -a 256 -c Inkmark-x.y.z-universal.dmg.sha256` — `OK` means it matches
  - Windows (PowerShell): `(Get-FileHash .\Inkmark-Setup-x.y.z-x64.exe).Hash -eq (Get-Content .\Inkmark-Setup-x.y.z-x64.exe.sha256).Split()[0]` — `True` means it matches
- **Build provenance**: confirms the file was built by this repository's release workflow from a public commit. With the [GitHub CLI](https://cli.github.com/) installed, run `gh attestation verify <file> --repo yataome1/inkmark`, or see Attestations on the repository's Actions page.

A checksum catches a corrupted or swapped download; build provenance confirms the file really came from this repository. Neither replaces code signing, so the first launch still needs the steps above.

## Keyboard shortcuts

Common shortcuts are listed below; press `F1` in the app to see all of them. On macOS use `⌘` instead of `Ctrl` (Replace is `⌥⌘F` and the shortcut list is `⇧⌘/`; the user guide lists the other differences).

| Action | Shortcut |
|---|---|
| New / Open / Save | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Source mode | `Ctrl+/` |
| Find / Replace | `Ctrl+F` / `Ctrl+H` |
| Close tab / Switch tab | `Ctrl+W` / `Ctrl+Tab` |
| All shortcuts | `F1` |

## Building from source

Requires Node.js and Rust, plus the Visual Studio C++ build tools on Windows or the Xcode Command Line Tools on macOS; see [CONTRIBUTING.md](CONTRIBUTING.md) (in Chinese).

```bash
npm install
npm start        # run in development
npm test         # unit tests
npm run dist     # Windows: build the installer and the portable version
npm run dist:mac # macOS: build the universal .dmg
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
