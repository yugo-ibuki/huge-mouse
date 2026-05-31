# Keyboard Shortcuts

Press `Ctrl+,` to open the built-in shortcut help inside the app.

## Navigation

| Shortcut           | Action           |
| ------------------ | ---------------- |
| `Ctrl+H` / `Cmd+↑` | Previous pane    |
| `Ctrl+L` / `Cmd+↓` | Next pane        |
| `Ctrl+Cmd+H`       | Previous session |
| `Ctrl+Cmd+L`       | Next session     |

Pane navigation wraps around — pressing next on the last pane selects the first, and vice versa. Session navigation wraps around in the same way.

## Input

| Shortcut                 | Action                                 |
| ------------------------ | -------------------------------------- |
| `Cmd+Enter` or `Enter`   | Send input (configurable in Settings)  |
| `Enter` or `Shift+Enter` | New line (depends on Send Key setting) |
| `↑` / `↓`                | Navigate input history                 |
| `/ + type`               | Filter slash commands                  |

## Panels

| Shortcut       | Action                                                           |
| -------------- | ---------------------------------------------------------------- |
| `Ctrl+P`       | Open pane preview (press twice for live mode) (key configurable) |
| `Ctrl+D`       | Open session detail popup (key configurable)                     |
| `Ctrl+G`       | Open git operations popup (key configurable)                     |
| `Ctrl+F`       | Open git diff viewer (key configurable)                          |
| `Ctrl+N`       | Quickly add a new `claude` window to the current tmux session    |
| `Ctrl+Shift+N` | Open new session dialog                                          |
| `Ctrl+,`       | Open keyboard shortcut help                                      |

## Actions

| Shortcut      | Action                                                |
| ------------- | ----------------------------------------------------- |
| `Ctrl+1-9`    | Send numbered choice directly (modifier configurable) |
| `Ctrl+W`      | Toggle compact mode (key configurable)                |
| `Ctrl+B`      | Toggle shell mode                                     |
| `Cmd+Shift+H` | Focus unitmux from any app (key configurable)         |

## In Preview / Detail Panels

All overlay panels support vim-style navigation:

| Key       | Action               |
| --------- | -------------------- |
| `j` / `k` | Scroll line by line  |
| `d` / `u` | Scroll half page     |
| `g` / `G` | Jump to top / bottom |
| `q`       | Close panel          |

## In Git Panel

| Key      | Action                 |
| -------- | ---------------------- |
| `j`/`k`  | Move cursor            |
| `Space`  | Toggle file selection  |
| `a`      | Select/deselect all    |
| `Enter`  | Stage selected files   |
| `Ctrl+A` | Stage all (git add -A) |
| `Ctrl+P` | Push to remote         |

## In Diff Panel

| Key           | Action                         |
| ------------- | ------------------------------ |
| `s`           | Toggle staged/unstaged diff    |
| `n` / `N`     | Next / previous changed file   |
| `]c` / `[c`   | Next / previous hunk           |
| `o` / `Enter` | Collapse or expand focused row |
| `j` / `k`     | Scroll line by line            |
| `d` / `u`     | Scroll half page               |
| `g` / `G`     | Jump to top / bottom           |
| `q` / `Esc`   | Close                          |

## In New Session Dialog

| Key     | Action                                |
| ------- | ------------------------------------- |
| `Tab`   | Switch New/Existing mode              |
| `h`/`l` | Toggle claude/codex                   |
| `j`/`k` | Navigate session list (Existing mode) |
| `Enter` | Create                                |

## General

| Shortcut | Action                          |
| -------- | ------------------------------- |
| `Escape` | Close current panel             |
| `q`      | Close panel (in overlay panels) |
