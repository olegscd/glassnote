# Glassnote — agent guide

Glassnote is a handwriting notes app with a Liquid Glass (iOS 26–style) look. Its features are modelled on GoodNotes: a notebook library, a pen/highlighter/eraser, page thumbnails and paper templates. It also has a whiteboard mode and a customizable pen engine. It is a **personal project by Olegs**: original branding only. Never use the GoodNotes name, logo or assets.

## The one rule that shapes everything
**The whole app is ONE self-contained file: `glassnote.html`.** It has inline CSS, inline JS, no build step, no npm runtime dependencies and no network requests. The only exception is `vendor/pdfjs.js` (pdf.js packed as a classic script), which is loaded lazily only when a PDF is imported. Keep it next to the HTML, and never edit it by hand. It must keep working by double-clicking the file. Do not split it into modules or add frameworks or CDNs unless Olegs explicitly asks.

## Where things are (inside glassnote.html)
Sections are marked with `/* ===== NAME ===== */` banners. Search for them:
`THEME` (CSS vars) → `CONFIG` → `PAPERS` → `ICONS` → `STORAGE` → `SETTINGS` (theme presets, Page/Theme/Input settings, `applyPage`) → `UI HELPERS` → `GEOMETRY / RENDERING` → `LIBRARY` → `EDITOR STATE` (panes A/B: `withPane`, `usePane`; tab strip: `renderTabs`, `closeTab`, per-tab undo `histories`) → `INK INPUT` → `POINTER HANDLING` → `ITEM OPS` → `PAGES / THUMBS` → `TOOLBAR` → `EXPORT` → `PDF` (`importPdf`, page backgrounds) → `PEN STUDIO` → `SIDE PANEL` (docs: pdf/img/web/note/live/dock; modes left/right/float; `fileStore` in IndexedDB) → `KEYBOARD & RESIZE` → `BOOT`.
See `.agents/rules/architecture.md` for the data model and how rendering, input and undo work.

## Desktop app (Tauri)
The same file also ships as a Windows app. `src-tauri/` holds a small Rust shell and `scripts/copy-web.mjs` copies the HTML to `dist/index.html`. Build it with `Build-Glassnote.ps1` (see `/package-exe`). Inside the app, `inApp()` is true, and `download()` uses the native Save-As command (`save_file` in `src-tauri/src/lib.rs`). Every native feature needs a browser fallback.

## How to check your work
1. `npm install` (first time only), then `npm test` runs `tests/smoke.mjs`. It drives the app in Edge/Chrome, exercises every tool and fails on any JS error. It saves screenshots to `tests/screenshots/`. **Run it after every change.**
2. For UI changes, also open `glassnote.html` in the browser and look at it. Glass effects need a real browser to judge.

## Working style Olegs likes
- Make the change, then say briefly what changed. Don't write long essays.
- Keep things customizable: new colours, sizes and defaults go in `CONFIG`, and new look-and-feel values go in CSS variables in `THEME`.
- New features should feel native to the Liquid Glass style: use the `.glass` class, pill buttons and springy transitions.
- If an idea is risky (data format change, big refactor), say so before doing it.

## More
- `.agents/rules/` — architecture, code conventions, verification rules
- `.agents/workflows/` — step-by-step recipes (`/test`, `/new-pen`, `/new-paper`, `/new-tool`, `/package-exe` = build the .exe)
- `docs/ROADMAP.md` — ideas and known limitations
- `README.md` — user-facing how-to
