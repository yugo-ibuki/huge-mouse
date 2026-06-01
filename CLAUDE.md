# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

unitmux is a floating Tauri desktop app that sends input to tmux sessions running `claude` or `codex` commands. It provides a lightweight UI for selecting and sending commands to active tmux panes.

- Tauri 2 + Rust + React 19 + TypeScript 5.9
- Build tooling: Cargo + Vite
- Documentation site: VitePress (`web/docs/`)

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
npm run typecheck        # TypeScript check for renderer
npm run typecheck:web    # TypeScript check for renderer only
```

## Architecture

Tauri architecture with Rust commands and a React renderer:

```
crates/unitmux-core/ → Rust core logic
  tmux.rs            → tmux interaction, git operations, pane parsing, JSONL conversation log
  token_usage.rs     → Claude/Codex JSONL token usage parsing
  skills.rs          → .claude/skills discovery

src-tauri/        → Tauri desktop shell
  src/main.rs     → Window bootstrap and local-image:// protocol
  src/commands.rs → Tauri command registration for tmux, git, window controls, streaming, images

src/renderer/src/  → React UI (browser environment)
  main.tsx         → React bootstrap
  App.tsx          → Root component with overlays and sidebar
  components/      → InputArea, PaneHeader, GitOverlay, DiffOverlay, PreviewOverlay, CreateDialog, Sidebar, etc.
  stores/          → Zustand stores (inputStore, uiStore, paneStore, settingsStore)
  hooks/           → useGlobalKeyboard, useStreaming, etc.
  assets/          → CSS, SVG
```

### Tauri Commands

- `list_sessions` → Returns `TmuxPane[]` filtered to panes running `claude` or `codex` only
- `send_input` → Sends text + images to a tmux pane by target, returns `SendResult`
- `ensure_shell_pane` → Creates/finds a `unitmux-shell` window in a session, returns target
- `create_session` / `create_new_session` → Adds tmux windows or sessions
- `select_images` → Opens the native image picker
- `git_add` / `git_add_files` / `git_commit` / `git_push` / `git_diff` → Git operations
- `start_stream` / `stop_stream` → Streams tmux preview content to the renderer

### Key Types

- `TmuxPane { target, pid, command, title, status, choices, prompt, activityLine }` — pane info with activity state
- `SendResult { success, error? }` — shared between Rust commands and renderer declarations

### Shell Pane Feature

- Ctrl+B toggles shell mode (sends commands to a shell pane instead of Claude)
- Shell pane (`unitmux-shell` tmux window) is created on-demand: first send or preview in shell mode
- Uses the user's default shell (bash, zsh, fish, etc.) — no command specified to `tmux new-window`
- Identified by `window_name === 'unitmux-shell'`; does not interfere with user-created windows
- If manually closed, auto-recreated on next send/preview
- Shell pane is auto-deleted when the session's last claude/codex pane is closed via ConfirmDialog
- Preview (Ctrl+P) and streaming work for shell pane output when in shell mode

### Image Attachment

- Images attached via "+" button (file dialog) or drag & drop onto the window
- Thumbnails displayed via `local-image://` custom protocol (bypasses file:// security restrictions)
- Drag & drop handled via Tauri window drag-drop events
- Images sent to Claude CLI as bracketed paste (`\x1b[200~`...`\x1b[201~`) so the CLI detects them as image file paths

### Git Operations

- `Ctrl+G` opens git overlay with vim-style file list (j/k navigate, Space to select, Enter to stage)
- Individual file staging via `git add -- <files>` or bulk staging via `git add -A`
- `Ctrl+F` opens diff viewer with staged/unstaged toggle and collapsible file sections

### UI Behavior

- Pane list auto-refreshes every 5 seconds via polling
- Cmd+Enter sends input from the textarea (configurable)
- First available pane is auto-selected on initial load
- Status indicators: green (idle), yellow (waiting), gray (busy) with activity line display

### TypeScript Configuration

TypeScript renderer config:

- `tsconfig.web.json` — renderer (DOM + React, `@renderer` path alias → `src/renderer/src`)

## Code Style

- Prettier: single quotes, no semicolons, 100-char width, no trailing commas
- EditorConfig: 2-space indent, LF line endings, UTF-8
- ESLint: TypeScript + React + React Hooks + React Refresh rules
