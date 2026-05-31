# Settings

Click the gear icon (⚙) in the header to open the settings sidebar.

## Available Settings

| Setting           | Description                                                      | Default   |
| ----------------- | ---------------------------------------------------------------- | --------- |
| **Always on Top** | Keep the window above other windows                              | On        |
| **Opacity**       | Adjust window transparency (50%–100%)                            | 100%      |
| **Font Size**     | Adjust the UI font size (8–18px)                                 | 12px      |
| **Theme**         | Switch between Dark and Light                                    | Dark      |
| **Choice Key**    | Modifier for quick choice shortcuts (`Ctrl` or `Cmd`)            | Ctrl      |
| **Send Key**      | Key combination to send input (`Cmd+Enter` or `Enter`)           | Cmd+Enter |
| **Vim Mode**      | Enable Escape+i sequence before sending input (for vim-mode CLI) | Off       |
| **Preview Key**   | Key for pane content preview (`Ctrl+<key>`)                      | P         |
| **Detail Key**    | Key for session detail popup (`Ctrl+<key>`)                      | D         |
| **Git Key**       | Key for git operations popup (`Ctrl+<key>`)                      | G         |
| **Diff Key**      | Key for git diff viewer (`Ctrl+<key>`)                           | F         |
| **Compact Key**   | Key to toggle compact mode (`Ctrl+<key>`)                        | W         |
| **Focus Key**     | Global shortcut to focus unitmux (`Cmd+Shift+<key>`)             | H         |

## Send Key

Choose between two send behaviors:

- **Cmd+Enter** (default) — `Enter` inserts a newline, `Cmd+Enter` sends. Good for multi-line input.
- **Enter** — `Enter` sends immediately, `Cmd+Enter` inserts a newline. Faster for short commands.

## Vim Mode

When enabled, unitmux sends `Escape` followed by `i` before delivering your input. This ensures the AI CLI is in insert mode if you are using vim-style key bindings in your terminal.

## Changing Key Bindings

Click the current key binding button (e.g., `Ctrl+P`) to enter key capture mode. Press any letter key to set the new binding. Press `Escape` to cancel.

All settings are saved automatically and survive app restarts.

## Token Usage

The Token Usage section shows aggregate usage from local Claude Code and Codex logs. Use **Refresh** to force a reload. Each group shows total, input, output, cached input, reasoning tokens, and cache hit rate.

## Slash Commands

The Slash Commands section lets you edit saved custom slash commands. Skills loaded from user and project skill folders are shown as read-only entries.
