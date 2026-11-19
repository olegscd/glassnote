---
trigger: always_on
---

# Glassnote code conventions

- **Single file.** All code stays in `glassnote.html`. Use no external scripts, fonts, CDNs or fetches. It must run from `file://` and offline.
- **Vanilla JS, no frameworks.** Use `'use strict'`, `const`/`let`, arrow functions and the small helpers that already exist (`$`, `$$`, `el`, `clamp`, `r1`, `r2`, `uid`, `clone`, `icon`, `toast`, `showMenu`, `segControl`).
- **Add to the right section.** Put new code under the matching `/* ===== SECTION ===== */` banner. Don't create parallel systems: reuse `req()`, `commitItems()`, `drawItem()` and `drawPage()`.
- **Customizable by default.** User-tweakable values go in `CONFIG` (JS) or `THEME` CSS variables, with a short comment. Settings shown in the app go in `db.settings` with a default in `CONFIG.defaults`.
- **Immutable items.** Never mutate an item object in place. Create a new one and commit a new array (this preserves undo and the caches).
- **Storage.** Wrap every `localStorage` access in try/catch (this already happens in `load`/`save`). Persist through `scheduleSave()`. Changing the data format needs a migration (see `migrateV1`).
- **Liquid Glass UI.** Floating surfaces use `.glass`, and buttons use `.btn` (`.on`/`.primary`), `.swatch`, `.seg` or `.pill`. Keep motion springy (`cubic-bezier(.2,1.4,.4,1)`-style) and corners rounded. Support dark mode through CSS variables, never hard-coded colours.
- **No browser dialogs.** Don't use `alert`, `confirm` or `prompt`. For destructive actions use the existing "tap again to confirm" pattern.
- **Touch + pen + mouse.** Every new interaction must work with all three. Keep `touch-action: none` on the stage and handle gestures yourself.
- **Performance.** Cull by `bboxOf`, cache Path2D in `PATHS`, and redraw through `req()` (rAF-batched), never in a loop. Keep per-move work O(stroke length) at most.
- **Comments.** Write short comments that explain *why*. Section banners stay.
- **Branding.** The app is called Glassnote. Don't copy GoodNotes' name, icons or artwork.
