---
trigger: model_decision
description: How Glassnote's data model, renderer, input pipeline, ink engine and undo work. Read before changing anything in glassnote.html beyond styling.
---

# Glassnote architecture

## Data model (persisted in localStorage key `glassnote.v2`)
```
db = {
  settings: { accent, wall1..3, blur, alpha, sat, radius, dark, refract, fingerDraws, snap },
  pens: [ { id, name, style:'smooth'|'classic', size, thinning, streamline, smoothing, taperStart, taperEnd, speed, opacity } ],
  ui: { penId, penColor, penSize(0-2), hlColor, hlSize, eraserSize, shapeKind, shapeColor, shapeSize, textColor, textSize, lib,
        tabs:[notebook ids], activeTab, panel:{ open, w, active, docs:[{id, type:'pdf'|'img'|'web', name, url?}] } },
  notebooks: [ {
    id, title, cover(index), created, updated,
    layout: 'paged' | 'scroll' | 'board',
    size: key of CONFIG.sizes, orient: 'portrait'|'landscape',
    paper: key of PAPERS, tone: key of CONFIG.tones | 'custom' (+ paperBg, paperLine, paperMargin hex),
    cam?: { cx, cy, z },              // last view (world centre + zoom)
    pages: [ { items: [...], h? } ]   // scroll/board always have exactly 1 page; scroll uses h (grows)
  } ]
}
```
Item types are stored in **page-local coordinates** (page units ≈ CSS px at 96 dpi):
- `ink` pen: `{type:'ink', tool:'pen', color, w, st:'smooth'|'classic', th, ts, te, op, pts:[x,y,p, x,y,p, ...]}`. Pen parameters are snapshotted per stroke, so editing a pen later never changes old ink.
- `ink` highlighter: `{type:'ink', tool:'hl', color, w, pts}`
- `shape`: `{type:'shape', kind:'line'|'arrow'|'rect'|'ellipse', x1,y1,x2,y2, color, w}`
- `text`: `{type:'text', x, y, text, size, color}`
- `img`: `{type:'img', x, y, w, h, src(dataURL)}`

**Items are immutable.** To change an item, build a new object (see `xformItem`) and a new `items` array. This is what makes undo trivial, and it is why `BB` (bbox) and `PATHS` (Path2D) are `WeakMap` caches keyed by the item object.

Old v1 data (`glassnote.v1`, `page.strokes`) is converted by `migrateV1()`. If you change the format, bump the key and add a migration. Never silently drop user data.

## Coordinates & camera
- World space: in paged mode, pages are stacked vertically and centred on x=0, with `CONFIG.pageGap` between them (`computeRects()` → `rects[]`). Scroll mode has one tall page. Board mode is infinite, and page-local coordinates are the same as world coordinates.
- `cam = {ox, oy, z}`; screen = world·z + (ox, oy). Helpers: `s2w`, `pageAt(world)`, `toLocal(pi, world)`, `originOf(pi)`.
- `clampCam()` keeps pages on screen (it does nothing in board mode). `TOP()`/`BOT` are the paddings for the glass bars.

## Rendering
- Two full-screen canvases in `#stage`: `#bc` (base: paper and committed items) and `#ov` (overlay: live stroke, lasso, selection box, laser).
- `req(base=true)` schedules a frame. `renderBase()` redraws only the visible pages, with culling via `bboxOf`. `renderOverlay()` also positions the DOM selection menu and the text editor.
- `drawPage(ctx, nb, pi, visibleRect, z, opt)` is shared by the screen, thumbnails, export and print.
- Paper templates are `PAPERS[key].draw(ctx, tone, r)` where `r = {x0,y0,x1,y1, w,h, board, z, lw?, dot?}`. Templates must only draw inside the visible rect and handle `board` (infinite) mode.

## Ink engine
Raw input is a list of points `{x, y, p(pressure), v(screen px/ms), pen(bool)}`.
`processRaw(raw, pen, final)`:
1. Pressure: if the input isn't a stylus, it is simulated from speed using `pen.speed`.
2. Stabilizer: an exponential follow filter controlled by `pen.streamline`.
3. Smoothing: 0–4 passes of a [1,2,1]/4 filter, set by `pen.smoothing`.
4. If `final`, it catches up to the pen tip and rounds the numbers.

Rendering: `buildOutline()` builds a filled Path2D (width from pressure × thinning, with eased tapers and round caps). It matches cap winding to the outline so caps don't punch holes. The `classic` style draws stroked quadratic segments instead. Highlighters stroke `centerPath()` with multiply (or screen on dark paper).
Hold-to-snap: `trySnap()` runs 520 ms after the pointer stops moving. It turns the stroke into a line, ellipse or rect.

## Input
All pointer input goes through the `#stage` listeners plus `startTool()`/`endPointer()`. The current gesture lives in `g` (`{type: 'draw'|'erase'|'shape'|'lasso'|'move'|'resize'|'pan'|'pinch'|'laser', ...}`).
- Two-finger touch is always pinch/pan. One finger draws only if `settings.fingerDraws` is on and no stylus has been seen (`penSeen`).
- Middle mouse, Space+drag or the hand tool pans. Ctrl/⌘+wheel zooms; a plain wheel scrolls.

## Undo
`pushUndo({t:'items', pi, before, after})` or `{t:'pages', before, after}`. These store array references (cheap because items are immutable). Always change items through `commitItems(pi, newArray)`. The eraser mutates `pg.items` live and pushes one undo entry when the stroke ends.

## Two panes (side-by-side notebooks)
The editor state (`cur, rects, cam, vw, vh, undoStack, redoStack, sel, hiddenItem, g, stage, bc, ov, bctx, octx, topPad, botPad`) lives in globals. `paneA` is the main editor and `paneB` is a notebook shown inside the side panel (doc type `note`).
- `withPane(p, fn)` temporarily swaps p's state into the globals, which is how `frame()` renders both panes. `ctxInactive` is true while rendering the inactive pane, and DOM UI updates (counter, selection menu, text editor, laser) are skipped then.
- `usePane(p)` makes p the active pane. Tools, toolbar, shortcuts, thumbs and the title all follow it. A pointer-down on a pane's stage activates it (`bindStage`).
- **If you add a new piece of per-editor state, add it to `savePane`/`loadPane`.**
- Coordinates: use `loc(e)` (client → stage px), never raw `clientX`, because pane B's stage is offset inside the panel.
- The same notebook can't be open in both panes (`openNotebook`/`loadIntoPaneB` refuse).

## PDFs
`importPdf(file)` lazily loads `vendor/pdfjs.js` (`loadPdfJs`). It renders each page once to a JPEG in IndexedDB and creates a paged notebook with `size: 'custom'` (`pageW/pageH`) and `page.bg = {id, w, h}`. `drawPage` draws `bgImage(id)` under the template and ink. Exports call `ensureBgs(nb)` first. Backups embed the images (`files` map), and `gcFiles` deletes unused ones. PDF notebooks are locked to the Pages layout.

## Tabs & side panel
- **Tabs:** opening a notebook adds it to `ui.tabs`. Home (`closeNotebook`) keeps the tabs open. `parkCurrent()` stores the camera and the undo stacks in `histories` (memory only) before switching. Shortcuts: Ctrl+Tab cycles, Ctrl+W closes, and you can drag tabs to reorder them.
- **Side panel:** `ui.panel.mode` is `right`, `left` or `float`. Drag `#pmove` to move it, or drop it on an edge to dock. `#pgrip` resizes a docked panel and `#pcorner` resizes a floating one. Docked width is `--panel-w`; `--pl`/`--pr` shrink `#stage`/`#libMain`, and `resizeStage()` re-fits the canvases. PDF and image blobs live in IndexedDB (`fileStore`, db `glassnote-files`), with an in-memory fallback. PDFs use the browser's built-in viewer in an iframe. Web docs are iframes; sites that block framing are opened with `popOut()` (Tauri `open_web_window` or `window.open`). Images can be dragged from the panel onto the canvas (`text/x-glassnote-file`). Live view (`startLive`) uses getDisplayMedia and is view-only, with a snapshot button. Docked windows (`pickDockWindow`/`syncDock`) call the Rust `list_windows`/`dock_window`/`undock_window`, which only move another app's window over `#pbody`. They never re-parent it.
- **Settings sheet:** has Page / Theme / Input panes. The Page pane edits `cur` live through `applyPage(changes)`, and a layout change reflows the content and clears that notebook's undo.

## Desktop shell
`src-tauri/` (Tauri v2) loads `dist/index.html`, which is a copy of `glassnote.html` made by `scripts/copy-web.mjs`. The webview has `withGlobalTauri` turned on, so JS calls `invoke('save_file', {name, data: base64})` from `download()`, and `invoke('open_web_window', {url,x,y,w,h})` from `popOut()`, when `inApp()` is true. `dragDropEnabled: false` lets HTML5 image drops reach the page. The app's localStorage is separate from the browser's, so moving notebooks between them uses Export/Import.

## UI
Sheets: `.sheet[data-sheet=...]` inside `#scrim`, opened with `openSheet(name)`. Use `showMenu(anchorEl, items)` for popovers and `toast(msg)` for messages. Icons are inline SVG paths in `ICONS`, rendered with `icon(name)`. Buttons with `data-i="name"` get an icon on boot.
