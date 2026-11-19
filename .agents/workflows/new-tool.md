---
description: Add a new editor tool to the bottom toolbar
---

1. **Icon:** add an SVG path to `ICONS` (24×24 viewBox, stroke-based, matching the existing style).
2. **Register it:** add `['key', 'Label (Shortcut)']` to `TOOLS`. If it needs a keyboard shortcut, add it to the `map` in the keydown handler.
3. **Toolbar context:** in `renderToolbar()`, add an `else if (tool === 'key')` branch for its options (swatches, sizes, hint). Store any options in `db.ui` with a default in `load()`.
4. **Behaviour:** in `startTool()`, start a gesture `g = { type: 'key', id, pi, ... }`. Handle movement in the stage `pointermove` switch and finish it in `endPointer()`. Draw live previews in `renderOverlay()`.
5. **Saving:** if it creates content, add an item type (immutable). Then cover it in `bboxOf`, `drawItem`, `xformItem`, `hitItem` (if erasable) and `finishLasso`, and commit it with `commitItems()`.
6. **Cursor:** add a `body[data-tool=key] #stage { cursor: ... }` rule.
7. Add a smoke-test step for it, then run `/test`.
