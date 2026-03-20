# Keyboard Shortcuts

## Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Send input (configurable) |
| `Cmd+↑` | Switch to previous pane |
| `Cmd+↓` | Switch to next pane |
| `Ctrl+H` / `Ctrl+L` | Switch to previous / next pane |
| `Ctrl+Cmd+H` / `Ctrl+Cmd+L` | Switch to previous / next session |
| `Ctrl+1-9` | Send numbered choice directly (modifier configurable) |
| `Ctrl+P` | Open pane content preview (key configurable) |
| `Ctrl+D` | Open session detail popup (key configurable) |
| `Ctrl+G` | Open git operations popup (key configurable) |
| `↑` / `↓` | Navigate input history |
| `Cmd+Shift+H` | Focus huge-mouse from any app (key configurable) |
| `Escape` | Close popup / refocus textarea |

## Session Navigation

Panes are grouped by tmux session. Use `Ctrl+H` / `Ctrl+L` to navigate between panes within a session. Use `Ctrl+Cmd+H` / `Ctrl+Cmd+L` to jump between sessions.

## Popup Navigation

All popups support vim-style navigation:

| Key | Action |
|-----|--------|
| `j` / `k` | Scroll line by line |
| `d` / `u` | Scroll half page |
| `g` / `G` | Jump to top / bottom |
| `q` | Close popup |

## Git Popup Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Stage all changes (git add -A) |
| `Ctrl+P` | Push to remote |
| `Enter` | Commit (when message input is focused) |

## Pane Wrap-Around

Pane navigation wraps around — pressing `Cmd+↓` on the last pane selects the first, and vice versa. Session navigation wraps around in the same way.
