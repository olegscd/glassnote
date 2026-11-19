---
description: Add a new built-in pen preset or a new pen parameter
---

## A new preset (e.g. "Calligraphy")
1. In `glassnote.html`, find `CONFIG.pens` and add an object with a unique `id`, a `name`, `style` (`'smooth'` or `'classic'`) and every number from the existing presets (`size, thinning, streamline, smoothing, taperStart, taperEnd, speed, opacity`).
2. Existing users only get new defaults after clicking **Restore defaults** in Pen Studio, because their pens are saved. Mention this to Olegs.
3. Run `/test`. Then open Pen Studio, pick the new pen and scribble on the test pad.

## A new parameter (e.g. "jitter" or "angle-based width")
1. Add a row to `PEN_PARAMS` (`[key, label, min, max, step, format]`). Pen Studio builds its slider automatically.
2. Give every preset in `CONFIG.pens` a value for it. In code, read it with a fallback (`pen.key ?? default`) so older saved pens still work.
3. Input-time effects go in `processRaw()`. Render-time effects need the value snapshotted onto the stroke in `liveItem()` (short key) and used in `buildOutline()` / `drawInk()`.
4. Make sure the Pen Studio pad re-renders live when the slider moves. It re-runs `liveItem()` on stored raw scribbles.
5. Run `/test`.
