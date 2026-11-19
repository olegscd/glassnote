---
description: Add a new paper template (e.g. isometric, planner, graph with margins)
---

1. In `glassnote.html`, add an entry to `PAPERS`: `key: { label: 'Name', draw(x, t, r) { ... } }`.
   - `x` is the canvas context, already transformed to page units.
   - `t` is the tone (`t.bg`, `t.line`, `t.margin`, `t.dark`).
   - `r` holds `x0,y0,x1,y1` (the visible area: only draw inside it), `w,h` (page size, `Infinity` on a whiteboard), `board` (bool), `z` (zoom), and optional `lw`/`dot` overrides used by the small previews.
   - Use `lwOf(r)` for hairline width. Skip dense detail when zoomed far out (see `grid`/`dotted`). Reuse `hLines`/`vLines`.
   - Make it work when `r.board` is true (infinite repetition), or fall back to another template, as `cornell` does.
2. It appears automatically in the New/Notebook settings sheet with a live preview.
3. Run `/test`. Then create notebooks using the template in Pages, Scroll and Whiteboard layouts and zoom in and out.
