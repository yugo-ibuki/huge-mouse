# unitmux

Unifies your AI coding sessions into a single floating interface.

[日本語版はこちら](README.ja.md)

## What it does

unitmux is a small always-on-top window that connects to all your AI coding assistants (`claude`, `codex`) running in tmux. Send commands, see status, and pick choices — all from one place, without switching terminals.



## Requirements

- macOS
- [tmux](https://github.com/tmux/tmux) with at least one session running `claude` or `codex`

## Install

### Homebrew (recommended)

```bash
brew install --cask yugo-ibuki/tap/unitmux
```

### Manual

Download the latest DMG from the [Releases](https://github.com/yugo-ibuki/unitmux/releases) page and drag the app to `/Applications`.

### macOS Gatekeeper warning

On first launch, macOS may block the app because it is not notarized. To open it:

**System Settings → Privacy & Security** → scroll down and click **Open Anyway** next to the blocked message.

## How to use

1. Start `claude` or `codex` inside a tmux pane
2. Open unitmux — it automatically finds your AI panes
3. Select a pane from the tags at the top
4. Type your message and press `Cmd+Enter` to send (configurable to `Enter` in settings)

### Pane badges

Each pane tag shows a badge indicating which tool is running: **CC** (Claude Code) in blue, **CX** (Codex) in green.

### Status indicators

| Indicator  | Meaning                                           |
| ---------- | ------------------------------------------------- |
| Green dot  | Ready for input                                   |
| Orange dot | Busy, processing                                  |
| Gray dot   | Waiting for your response — choice buttons appear |

### When the AI asks a question

When `claude` or `codex` presents numbered choices (e.g. "1. Yes / 2. No"), clickable buttons appear next to the pane tag. Click one to respond instantly.

### Keyboard shortcuts

| Shortcut                    | Action                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `Cmd+Enter` or `Enter`      | Send input (configurable)                                               |
| `Cmd+↑`                     | Switch to previous pane                                                 |
| `Cmd+↓`                     | Switch to next pane                                                     |
| `Ctrl+1-9`                  | Send numbered choice directly (modifier key configurable)               |
| `Ctrl+H` / `Ctrl+L`         | Switch to previous / next pane                                          |
| `Ctrl+Cmd+H` / `Ctrl+Cmd+L` | Jump to previous / next session                                         |
| `Ctrl+P`                    | Open pane content preview / toggle live streaming (key configurable)    |
| `Ctrl+N`                    | Create a new session (select target tmux session and command)           |
| `Ctrl+D`                    | Open session detail popup (key configurable)                            |
| `Ctrl+C`                    | Close session with confirmation (when detail panel is open)             |
| `Ctrl+G`                    | Open git operations popup (key configurable)                            |
| `Ctrl+S`                    | Stop the running session — sends Escape to interrupt (key configurable) |
| `Ctrl+W`                    | Toggle compact mode — shrinks window to tab bar only (key configurable) |
| `Ctrl+N`                    | Create a new session (select target tmux session and command)           |
| `/`                         | Open slash command autocomplete (when at start of input)                |
| `Ctrl+C`                    | Close session with confirmation (when detail panel is open)             |
| `↑` / `↓`                   | Navigate input history                                                  |
| `Cmd+Shift+H`               | Focus unitmux from any app (key configurable)                        |
| `Escape`                    | Close popup / refocus textarea                                          |

Popups support vim-style navigation: `j`/`k` (scroll), `d`/`u` (half-page), `g`/`G` (top/bottom), `q` (close).

The pane preview (`Ctrl+P`) opens scrolled to the bottom and highlights Claude's last response with a blue accent border. Press `Ctrl+P` again to start **live streaming** — the preview updates every 500ms in real time, with a pulsing LIVE badge. You can also toggle streaming with the ▶/⏸ button in the popup header. During streaming, `j`/`k` scrolling pauses auto-scroll; press `G` to resume following the latest output.

### Session detail

Press `Ctrl+D` to view details of the selected pane: target, command, model, session ID, PID, CWD, and git branch/status. The detail panel also has a **Close Session** button to terminate the pane. Pressing `Ctrl+C` while the detail panel is open shows a confirmation dialog before closing.

### Session management

Press `Ctrl+N` to create a new session. A dialog lets you pick a target tmux session and choose whether to launch `claude` or `codex`. The new window is created in the selected tmux session and the pane list refreshes automatically.

### Git operations

Press `Ctrl+G` to open git operations for the selected pane's working directory. You can **Add All**, **Commit** (with a message), and **Push** directly from the popup. Shortcuts within the popup: `Ctrl+A` (add all), `Ctrl+P` (push).

### Slash commands

Save reusable text snippets as slash commands (e.g., `/fix`, `/review`). Type `/` at the start of the textarea to see a filterable autocomplete list. Select a command with `Enter`, `Tab`, or click to insert its body. Manage commands in the **Slash Commands** section of the sidebar.

### Settings

Click the gear icon to access settings:

- **Always on Top** — keep the window above other windows
- **Opacity** — adjust window transparency (50%–100%)
- **Font Size** — adjust text size for textarea and preview log
- **Theme** — switch between Dark and Light
- **Choice Key** — change the modifier for quick choice shortcuts (`Ctrl` or `Cmd`)
- **Send Key** — choose between `Cmd+Enter` or `Enter` to send (the other key inserts a newline)
- **Vim Mode** — enable Escape+i insert mode switch for Claude CLI's vim editor mode
- **Stop Key** — change the key for stopping a running session (`Ctrl+<key>`)
- **Compact Key** — change the key for compact mode toggle (`Ctrl+<key>`)
- **Preview Key** — change the key for pane content preview (`Ctrl+<key>`)
- **Detail Key** — change the key for session detail popup (`Ctrl+<key>`)
- **Git Key** — change the key for git operations popup (`Ctrl+<key>`)
- **Focus Key** — change the global shortcut to focus unitmux (`Cmd+Shift+<key>`)
- **Slash Commands** — add, edit, and delete reusable slash commands

## License

MIT
