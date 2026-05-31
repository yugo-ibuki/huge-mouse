# Shell Mode

## Overview

Shell mode lets you send commands to a dedicated shell pane alongside your AI session. Useful for running tests, checking output, or executing commands without leaving unitmux.

## Toggle Shell Mode

Press `Ctrl+B` to toggle shell mode on/off. When active, the input placeholder changes to "Type shell command..."

## Shell Pane

- A `unitmux-shell` window is created automatically in the same tmux session on first use
- Uses your default shell (bash, zsh, fish, etc.)
- If manually closed, it is recreated on the next send
- Auto-deleted when the session's last claude/codex pane is closed

## Keyboard Shortcut

| Shortcut | Action            |
| -------- | ----------------- |
| `Ctrl+B` | Toggle shell mode |

## Preview in Shell Mode

Pane preview (`Ctrl+P`) and live streaming work for the shell pane when in shell mode.
