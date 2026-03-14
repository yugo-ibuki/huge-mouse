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

Download the latest release from the [Releases](https://github.com/yugo-ibuki/huge-mouse/releases) page and open the app.

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
| `↑` / `↓` | Navigate input history |

### Settings

Click the gear icon to access settings:

- **Always on Top** — keep the window above other windows
- **Theme** — switch between Dark and Light
- **Choice Key** — change the modifier for quick choice shortcuts (`Ctrl` or `Cmd`)

## License

MIT
