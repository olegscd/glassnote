# Glassnote

A Liquid Glass handwriting notebook and whiteboard, all in one HTML file.

## Run it
Double-click **`glassnote.html`**. That's the whole app. It works offline in Edge or Chrome.

Optional: `npm start` serves it at http://localhost:5173/glassnote.html. Note that notebooks saved there are kept separately from the ones you saved by double-clicking the file.

## Use it
- **New → Notebook / Scroll / Whiteboard.** Tap the notebook's title, or ⚙, to change its layout, paper size, orientation, template, paper colour (including fully custom paper/line/margin colours) and cover. The Theme tab in ⚙ has one-tap theme presets.
- **Tabs:** every notebook you open gets a tab along the top. 🏠 goes back to Documents. Ctrl+Tab switches tabs, Ctrl+W closes one, and you can drag tabs to reorder them. Each tab keeps its own undo history.
- **Write on PDFs:** use New → Import PDF, drag a PDF onto Documents, or press "Write on this PDF" in the side panel. Each page becomes a notebook page.
- **Two notebooks side by side:** in the side panel, use + → Notebook side by side (or right-click a tab). Both are fully editable; whichever you touch becomes active.
- **Side panel:** press `\`, use the panel button, or drag the handle at the right edge. It can hold PDFs, images and web pages next to your notes, and you resize it by dragging its left edge. Drag pictures from the panel onto the page. Sites that won't load inside the panel open in their own window with ↗. Drag the ⋮⋮ grip to float the panel anywhere, or drop it on the left or right edge to dock it there. Live view shows any window (view only, with a snapshot button). In the desktop app, Dock an app window pins a real app over the panel.
- **Tools:** P pen · H highlighter · E eraser · S shapes · L lasso · T text · K laser · Space+drag pan
- **Zoom:** Ctrl/⌘+scroll or pinch · F fit · 0 for 100%
- **Edit:** Ctrl+Z / Ctrl+Shift+Z undo/redo · Ctrl+C/X/V/D copy/cut/paste/duplicate · Ctrl+A select all · Delete
- **Hold to snap:** pause at the end of a pen stroke to turn it into a line, circle or rectangle
- **Pen studio:** use the pen menu in the toolbar, or the ✒ button in the library, to tune stabilizer, smoothing, pressure, taper, speed and opacity, and test them on a scratch pad
- **Back up your notes:** use Export → Backup (.json) and Import in the library. Notes are stored in this browser only.

## Customize
| What | Where |
|---|---|
| Glass, colours, wallpaper | ⚙ Appearance in the app, or the `THEME` block at the top of `<style>` |
| Paper sizes, colours, covers, tool sizes, default pens | `CONFIG` at the top of `<script>` |
| Paper templates | `PAPERS`; each is a small `draw()` function |

## Desktop app (Windows)
Double-click **`Build Glassnote.bat`**. It checks for Node.js, Rust and the Visual Studio C++ Build Tools, and asks before installing anything missing. Then it builds:
- `release\Glassnote.exe`, a portable app you can run directly
- `release\Glassnote_0.3.0_x64-setup.exe`, an installer that adds a Start-menu entry

The first build takes a while because Rust compiles everything once. After that it takes about a minute. Run `Build-Glassnote.ps1 -Dev` to try changes in a window without doing a full build.

In the app, Export uses a normal Save-as dialog. The app keeps its own notebooks, separate from your browser: move them with Export → Backup (.json), then Import.

## Working on it with Antigravity
Open this folder (`C:\Glassnote`) as the workspace. Antigravity loads these automatically:
- `AGENTS.md`: the project overview and the single-file rule
- `.agents/rules/`: architecture, conventions, and "always verify"
- `.agents/workflows/`: slash commands `/test`, `/new-pen`, `/new-paper`, `/new-tool`, `/package-exe` (build & fix the desktop app)

First-time setup for testing: `npm install`, then `npm test`. The test drives the app in Edge, checks every tool and saves screenshots to `tests/screenshots/`.

Ideas and known limits are in `docs/ROADMAP.md`.
