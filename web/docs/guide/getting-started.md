# Getting Started

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

On first launch, macOS may block the app because it is not notarized.

**System Settings → Privacy & Security** → scroll down and click **Open Anyway**.

## First Launch

1. Start `claude` or `codex` inside a tmux pane
2. Open huge-mouse — it automatically finds your AI panes
3. Select a pane from the tags at the top
4. Type your message and press `Cmd+Enter` to send

That's it. No configuration, no setup.
