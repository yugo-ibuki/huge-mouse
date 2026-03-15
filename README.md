# huge-mouse

A floating desktop app that sends input to tmux sessions running `claude` or `codex`.

[日本語版はこちら](README.ja.md)

## What it does

huge-mouse sits on top of your other windows and lets you type commands to AI coding assistants (`claude`, `codex`) running in tmux — without switching to your terminal.

It auto-discovers active AI panes, shows their status, and even lets you click numbered choices when the AI asks a question.

## Requirements

- macOS or Linux
- [tmux](https://github.com/tmux/tmux) with at least one session running `claude` or `codex`

## Install

### Homebrew (recommended)

```bash
brew install --cask yugo-ibuki/tap/huge-mouse
```

### Manual

Download the latest DMG from the [Releases](https://github.com/yugo-ibuki/huge-mouse/releases) page and drag the app to `/Applications`.

### macOS Gatekeeper warning

On first launch, macOS may block the app because it is not notarized. To open it:

**System Settings → Privacy & Security** → scroll down and click **Open Anyway** next to the blocked message.

## How to use

1. Start `claude` or `codex` inside a tmux pane
2. Open huge-mouse — it automatically finds your AI panes
3. Select a pane from the tags at the top
4. Type your message and press `Cmd+Enter` to send

### Status indicators

| Indicator | Meaning |
|-----------|---------|
| Green dot | Ready for input |
| Yellow dot | Waiting for your response — choice buttons appear |
| Gray dot | Busy, processing |

### When the AI asks a question

When `claude` or `codex` presents numbered choices (e.g. "1. Yes / 2. No"), clickable buttons appear next to the pane tag. Click one to respond instantly.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Send input |
| `Cmd+↑` | Switch to previous pane |
| `Cmd+↓` | Switch to next pane |
| `Ctrl+1-9` | Send numbered choice directly (modifier key configurable) |
| `Ctrl+L` | Open pane content preview (key configurable) |
| `Ctrl+D` | Open session detail popup (key configurable) |
| `Ctrl+G` | Open git operations popup (key configurable) |
| `↑` / `↓` | Navigate input history |
| `Cmd+Shift+H` | Focus huge-mouse from any app (key configurable) |
| `Escape` | Close popup / refocus textarea |

Popups support vim-style navigation: `j`/`k` (scroll), `d`/`u` (half-page), `g`/`G` (top/bottom), `q` (close).

### Session detail

Press `Ctrl+D` to view details of the selected pane: target, command, model, session ID, PID, CWD, and git branch/status.

### Git operations

Press `Ctrl+G` to open git operations for the selected pane's working directory. You can **Add All**, **Commit** (with a message), and **Push** directly from the popup. Shortcuts within the popup: `Ctrl+A` (add all), `Ctrl+P` (push).

### Settings

Click the gear icon to access settings:

- **Always on Top** — keep the window above other windows
- **Opacity** — adjust window transparency (50%–100%)
- **Theme** — switch between Dark and Light
- **Choice Key** — change the modifier for quick choice shortcuts (`Ctrl` or `Cmd`)
- **Preview Key** — change the key for pane content preview (`Ctrl+<key>`)
- **Detail Key** — change the key for session detail popup (`Ctrl+<key>`)
- **Git Key** — change the key for git operations popup (`Ctrl+<key>`)
- **Focus Key** — change the global shortcut to focus huge-mouse (`Cmd+Shift+<key>`)

## License

MIT
