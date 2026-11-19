---
trigger: always_on
---

# Verify every change

After editing `glassnote.html`:
1. Run `npm test` (the smoke test in `tests/smoke.mjs`). It must print `PASS` with zero page errors. If it fails, fix the cause; don't weaken the test.
2. For any feature you add, extend `tests/smoke.mjs` with a step that exercises it and asserts something concrete (for example, an item count, a value in `db`, or no errors).
3. For visual changes, look at the screenshots in `tests/screenshots/` (or open the app in the browser) and check that it still looks like Liquid Glass in both light and dark mode.
4. Make sure existing notebooks still load. If you touched the data format, test with data saved before your change.
5. Then summarize the change for Olegs in a few bullet points.
