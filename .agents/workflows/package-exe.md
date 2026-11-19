---
description: Build the Glassnote Windows app (Tauri) and fix build errors
---

The desktop wrapper already exists. Don't re-scaffold it.

**Layout:**
- `src-tauri/`: Rust shell. `lib.rs` has a single command, `save_file`, which opens a native Save-As dialog.
- `scripts/copy-web.mjs`: copies `glassnote.html` to `dist/index.html`.
- `Build-Glassnote.ps1` / `Build Glassnote.bat`: one-click build.
- Output: `release\Glassnote.exe` (portable) plus the NSIS installer.

## Build
1. Run `.\Build-Glassnote.ps1` from `C:\Glassnote`. It checks Node, Rust and the MSVC Build Tools, offers to install anything missing (it asks first), runs `npm install`, then `npm run build:exe`.
2. For a quick look without building, run `.\Build-Glassnote.ps1 -Dev` (or `npm run app`). It opens a dev window.

## If it fails
- **`link.exe not found` / MSVC errors:** the C++ Build Tools ("Desktop development with C++") are missing. Install them, then reboot.
- **`cargo not found` after installing:** open a new terminal so PATH refreshes.
- **Rust compile error in `src-tauri/src/lib.rs`:** check it against the installed `tauri` / `tauri-plugin-dialog` v2 APIs (`cargo doc --open` in `src-tauri`) and fix it with minimal changes.
- **Icon errors:** run `npx tauri icon src-tauri/icons/icon.png` to regenerate every size.
- **NSIS download blocked:** set `bundle.targets` to `[]` in `tauri.conf.json` to build only the portable exe.

## Rules
- `glassnote.html` is the only source for the UI. Never edit `dist/`.
- JS↔Rust bridge: the app detects desktop mode with `inApp()` (`window.__TAURI__`). Any new native feature should get a Rust `#[tauri::command]` in `lib.rs` and a browser fallback in the HTML, so the file still works when double-clicked.
- Keep `version` in sync across `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` when releasing.
- Run `/test` (the browser smoke test) before building.
