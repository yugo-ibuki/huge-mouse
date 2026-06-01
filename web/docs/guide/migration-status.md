# Migration Status

This page tracks the Electron-to-Rust migration state for unitmux.

## Completed

- Electron runtime files were removed.
- The app runtime now uses Rust/Tauri.
- Tmux, git, token usage, image handling, and shell-pane logic live in Rust crates.
- The image picker path has platform implementations for macOS, Linux, and Windows release targets.
- The renderer uses a Tauri bridge instead of Electron preload code.
- Release and packaging scripts now build Rust artifacts.
- The release job runs `npm run lint`, `npm test`, and
  `cargo clippy --workspace --all-targets -- -D warnings` before artifact builds.
- Release assets are staged with explicit names: `unitmux-macos.dmg`, `unitmux-linux`, and `unitmux-windows.exe`.
- macOS release builds set `REQUIRE_DMG=1`, so DMG creation failures stop the release while local bundle checks can
  still validate the `.app` bundle when `hdiutil` is unavailable.
- The macOS release job validates `Info.plist`, `.icns`, and codesign before artifact upload.
- The Linux and Windows release jobs validate their generated binaries before artifact upload.
- A static migration verification command is available as `npm run verify:migration`.
- A real-desktop macOS GUI smoke command is available as `npm run smoke:mac-gui`.
- Development mode now uses `scripts/dev.mjs` to start the Vite renderer server on the Tauri `devUrl`
  (`http://127.0.0.1:5173`) before launching `cargo run -p unitmux`; `npm run start` uses a release-mode Cargo run
  against the built renderer.
- The development runner tears down the Cargo process if the Vite renderer server exits while Tauri is running.
- Static regression tests cover:
  - removed Electron dependencies and files
  - the `electron-to-chromium` lockfile entry as a browserslist transitive dependency
  - macOS bundle executable and `Info.plist` contract
  - Tauri command wiring
  - renderer-to-Rust bridge wiring
  - development runner process cleanup
  - local image CSP alignment
  - shortcut/help-overlay contract
  - residual legacy-runtime scans

`npm run smoke:mac-gui` preflights the packaged app before launch by checking that:

- `Contents/MacOS/unitmux` exists and is executable
- `Contents/Info.plist` passes `plutil -lint`
- the `.app` passes `codesign --verify --deep --strict`

After launch, the same smoke command checks that System Events can see a frontmost `unitmux` window whose visible
size is close to the expected 700x400 floating window.

If macOS blocks System Events access, the smoke command reports that Accessibility permission is required for the
terminal running the check.

Before launching unitmux, the smoke command also compiles and launches a minimal signed AppKit control app. If that
control app cannot be opened, the command reports the host LaunchServices failure separately from the unitmux bundle
validation result.

## Verified

Last rechecked in this workspace on 2026-06-01.

The current workspace passes:

- `cargo fmt --check`
- `npm run typecheck`
- `npm run lint`
- `node --check scripts/dev.mjs`
- `npm test`
- `cargo clippy --offline --workspace --all-targets -- -D warnings`
- `npm run build`
- `npm run build:mac`
- `npm run web:build`
- `npm ls --depth=0`
- `cargo tree -p unitmux --depth 1`
- `npm run verify:migration`
- legacy-runtime residual scans
- bundle validation for `Info.plist`, `.icns`, and `codesign`

The focused documentation/shortcut contract check also passes:

- `npx vitest run tests/shortcut-contract.test.ts --root .`

Development-mode startup was also smoke-checked in this workspace:

- `npm run dev` starts the Vite renderer server, reaches `target/debug/unitmux`, and Ctrl+C tears down the
  `127.0.0.1:5173` listener.
- A leftover listener on `[::1]:5173`, when present, belongs to another local checkout and does not respond through
  unitmux's `127.0.0.1:5173` dev URL.

One lockfile entry still mentions Electron by name:

- `electron-to-chromium` in `package-lock.json`

That package is browserslist data for the frontend toolchain, not Electron runtime code or packaging.

## Remaining

- Real macOS GUI smoke verification of the packaged app
- Visual confirmation that the packaged app behaves the same under LaunchServices on a desktop session
- DMG creation on a machine with working `hdiutil`, if DMG output is required for release

`REQUIRE_DMG=1 npm run bundle:mac` was re-run on 2026-06-01 and correctly failed with `DMG creation failed` after
`hdiutil` reported that no disk image device is available in this runner. This confirms the release-only DMG gate
still fails closed here instead of uploading a missing macOS artifact.

Run `npm run smoke:mac-gui` on a real macOS desktop session for the packaged-app GUI smoke check.

In this runner, `open target/release/bundle/macos/unitmux.app` currently returns `kLSNoExecutableErr` even though
the bundle contains `Contents/MacOS/unitmux` and the binary is present and executable. Treat that as a
LaunchServices/sandbox limitation in this environment.

`npm run smoke:mac-gui` was re-run on 2026-06-01 after changing the control check to use a compiled AppKit app. It
still detects that even the minimal signed AppKit control app cannot be opened in this runner, then reports the same
`kLSNoExecutableErr` before the unitmux launch step.

Direct execution of `Contents/MacOS/unitmux` in this runner also aborts during AppKit / LaunchServices
initialization (`SIGABRT` in `NSApplication sharedApplication`), so GUI smoke verification still needs a real
desktop-session launch path outside this environment.

## Details

The repository root also contains the same migration notes in `RUST_MIGRATION_STATUS.md`.
