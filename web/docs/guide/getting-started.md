# Getting Started

Migration status and remaining verification steps: [Migration Status](/guide/migration-status)

## Requirements

- macOS or Linux
- [tmux](https://github.com/tmux/tmux) with at least one session running `claude` or `codex`
- Linux only: `zenity` for the image picker button

## Install

### macOS Homebrew

```bash
brew install --cask yugo-ibuki/tap/unitmux
```

### Manual

- macOS: Download `unitmux-macos.dmg` from the [Releases](https://github.com/yugo-ibuki/unitmux/releases) page and drag the app to `/Applications`.
- Linux: Download the `unitmux-linux` binary from the [Releases](https://github.com/yugo-ibuki/unitmux/releases) page, make it executable, and place it on your `PATH`.

### macOS Gatekeeper warning

On first launch, macOS may block the app because it is not notarized.

**System Settings → Privacy & Security** → scroll down and click **Open Anyway**.

## First Launch

1. Start `claude` or `codex` inside a tmux pane
2. Open unitmux — it automatically finds your AI panes
3. Select a pane from the tags at the top
4. Type your message and press `Cmd+Enter` to send

That's it. No configuration, no setup.
