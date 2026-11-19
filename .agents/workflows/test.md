---
description: Run the Glassnote smoke test and review the screenshots
---

1. If `node_modules` doesn't exist, run `npm install`.
2. Run `npm test`.
3. If it fails, read the error. It names the step and any JS page errors. Fix `glassnote.html` (not the test, unless the test itself is wrong), then run it again.
4. Open the PNGs in `tests/screenshots/` and check that the library, the editor in each layout, the selection menu and Pen Studio all look right.
5. Report PASS/FAIL and anything that looked off.
