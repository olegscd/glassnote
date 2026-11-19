# Glassnote roadmap & known limitations

## Known limitations
- The eraser removes whole strokes or shapes only. There is no partial (pixel-style) eraser yet.
- Text boxes are plain text: one font, no bold, italics or alignment.
- Images can be moved and resized uniformly but not cropped or rotated.
- There is no rotation in lasso transforms.
- Pages can't be reordered by dragging thumbnails.
- Docked windows are positioned over the panel, not truly embedded. Some apps enforce a minimum size or snap back.
- PDF pages are images, so text in them can't be selected or searched yet.
- Notebook storage is localStorage (PDF pages and panel files use IndexedDB) (about 5–10 MB). Many large images can fill it, and the app will toast a warning.
- Many sites (Google, YouTube, banking…) refuse to load inside the side panel. Use ↗ to open them in a window.
- Downloads and printing are blocked when the app runs inside the claude.ai preview frame. They work when the file is opened directly.

## Ideas (roughly by value)
1. **Partial eraser:** split ink strokes where the eraser crosses them.
2. **Page reorder & duplicate** in the thumbnail sidebar (drag to reorder).
3. **IndexedDB storage** for large notebooks and images, with migration from localStorage.
4. **Audio recording synced to ink:** tap a stroke to hear what was said at that moment.
5. **Search** text boxes across notebooks.
6. **Folders / tags** in the library.
7. **Rotation handle** on lasso selections.
8. **Pen favourites bar:** 3–5 pinned pen+colour combos in the toolbar.
9. **Sticky notes / cards** on the whiteboard, and connectors between shapes.
- Done: write on PDFs, side-by-side notebooks, a movable side panel, docked app windows, live view.
10. **Handwriting smoothing per pressure curve** (Pen Studio curve editor).
11. **Desktop polish:** Mica/Acrylic window glass, a file association for `.glassnote.json`, and auto-update.
12. **Sync:** export/import to a folder, or a small backend.
