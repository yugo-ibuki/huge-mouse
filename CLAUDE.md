# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

unitmux is a floating Electron desktop app that sends input to tmux sessions running `claude` or `codex` commands. It provides a lightweight UI for selecting and sending commands to active tmux panes.

- Electron 39 + React 19 + TypeScript 5.9
- Build tooling: electron-vite + electron-builder
- Current status: scaffold phase (v0.1.0) with functional tmux integration

## Commands

```bash
npm run dev              # Start development mode
npm run build            # Full build (typecheck + compile)
npm run build:mac        # Build for macOS
npm run build:win        # Build for Windows
npm run build:linux      # Build for Linux
npm run build:unpack     # Build unpacked (for testing)
npm run lint             # ESLint
npm run format           # Prettier formatting
npm run typecheck        # TypeScript check (both node + web)
npm run typecheck:node   # TypeScript check for main/preload only
npm run typecheck:web    # TypeScript check for renderer only
```

## Architecture

Three-process Electron architecture with context isolation:

```
src/main/          → Electron main process (Node.js)
  index.ts         → Window creation (400×300, always-on-top), IPC handler registration
  tmux.ts          → tmux interaction: listPanes(), sendInput() with target validation

src/preload/       → Context bridge (secure IPC between main ↔ renderer)
  index.ts         → Exposes window.api (TmuxAPI) via contextBridge
  index.d.ts       → Type definitions for Window.api (TmuxAPI) and Window.electron (ElectronAPI)

src/renderer/src/  → React UI (browser environment)
  main.tsx         → React bootstrap
  App.tsx          → Root component (pane selector, text input, send button)
  assets/          → CSS, SVG
```

### IPC Channels

- `tmux:list-sessions` → Returns `TmuxPane[]` filtered to panes running `claude` or `codex` only
- `tmux:send-input` → Sends text to a tmux pane by target (e.g., `session:0.0`), returns `SendResult`
- `tmux:ensure-shell-pane` → Creates/finds a `unitmux-shell` window in a session, returns target

### Key Types

- `TmuxPane { target, pid, command, title }` — defined in main/tmux.ts, preload/index.ts, renderer App.tsx
- `SendResult { success, error? }` — defined in preload/index.ts

### Shell Pane Feature

- Ctrl+B toggles shell mode (sends commands to a shell pane instead of Claude)
- Shell pane (`unitmux-shell` tmux window) is created on-demand: first send or preview in shell mode
- Uses the user's default shell (bash, zsh, fish, etc.) — no command specified to `tmux new-window`
- Identified by `window_name === 'unitmux-shell'`; does not interfere with user-created windows
- If manually closed, auto-recreated on next send/preview
- Shell pane is auto-deleted when the session's last claude/codex pane is closed via ConfirmDialog
- Preview (Ctrl+P) and streaming work for shell pane output when in shell mode

### UI Behavior

- Pane list auto-refreshes every 5 seconds via polling
- Cmd+Enter sends input from the textarea
- First available pane is auto-selected on initial load

### TypeScript Configuration

Three separate tsconfigs via composite project references:

- `tsconfig.node.json` — main + preload (Node environment)
- `tsconfig.web.json` — renderer (DOM + React, `@renderer` path alias → `src/renderer/src`)
- `tsconfig.json` — root that references both

## Code Style

- Prettier: single quotes, no semicolons, 100-char width, no trailing commas
- EditorConfig: 2-space indent, LF line endings, UTF-8
- ESLint: TypeScript + React + React Hooks + React Refresh rules
