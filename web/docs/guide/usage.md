# Usage

## Status Indicators

Each pane tag shows a colored dot indicating its current state:

| Indicator | Meaning                                           |
| --------- | ------------------------------------------------- |
| 🟢 Green  | Ready for input                                   |
| 🟡 Yellow | Waiting for your response — choice buttons appear |
| ⚫ Gray   | Busy, processing                                  |

## Session Grouping

Panes are grouped by their tmux session name. Each group shows the session name as a label, making it easy to manage multiple sessions at once.

## Sending Input

Select a pane from the tags at the top, type your message in the textarea, and press `Cmd+Enter` to send (the send key is configurable in Settings).

## Responding to Choices

When `claude` or `codex` presents numbered choices (e.g. "1. Yes / 2. No"), clickable buttons appear next to the pane tag. You can:

- **Click** the button to respond
- **Press `Ctrl+1-9`** to send the choice directly (modifier key is configurable)

## Pane Content Preview

Press `Ctrl+P` to open a scrollable preview of the selected pane's output. Press `Ctrl+P` twice to enable live streaming mode (auto-refreshing). An activity indicator shows when Claude is actively processing (e.g., "✻ Imagining... (17s)"). Navigate with vim-style keys:

| Key          | Action               |
| ------------ | -------------------- |
| `j` / `k`    | Scroll line by line  |
| `d` / `u`    | Scroll half page     |
| `g` / `G`    | Jump to top / bottom |
| `q` or `Esc` | Close                |

## Session Detail

Press `Ctrl+D` to view details of the selected pane:

- Target, command, PID
- Model and session ID (if detected)
- CWD, git branch, and git status

## Input History

Use `↑` / `↓` arrow keys in the textarea to navigate through previously sent inputs, just like a terminal.

## Compact Mode

Press `Ctrl+M` to toggle compact mode, which hides the input area and shows only the pane tags. The key is configurable in Settings.

## New Session

Press `Ctrl+N` to open the new session dialog.

- **New Session** tab: enter a name to create a brand new tmux session with `claude` or `codex`
- **Add to Existing** tab: select an existing tmux session to add a new window

Use `Tab` to switch between modes, `h`/`l` to toggle `claude`/`codex`.

## Global Focus

Press `Cmd+Shift+H` to bring unitmux to the front from any app. The key is configurable in Settings.

## Keyboard Shortcut Help

Press `Ctrl+,` to open the built-in shortcut reference panel showing all available shortcuts.

## Image Attachment

Click the "+" button or drag & drop images onto the window to attach them.

- Supported formats: PNG, JPG, GIF, WebP, SVG, BMP
- Images show as thumbnails before sending, with a remove button on hover
- Attached images are sent along with your message

## Shell Mode

Press `Ctrl+B` to toggle shell mode.

- In shell mode, input is sent to a dedicated `unitmux-shell` tmux window
- The shell pane is created on-demand in the same session
- Uses the user's default shell (bash, zsh, fish, etc.)
- Shell pane is auto-deleted when the session's last claude/codex pane is closed

## Slash Commands & Skills

Type `/` in the input to filter available commands.

- Custom slash commands can be defined
- Skill files from `~/.claude/skills/` are automatically loaded
- Navigate the autocomplete with arrow keys, select with `Enter` or `Tab`
