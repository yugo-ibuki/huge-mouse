---
layout: home

hero:
  name: unitmux
  text: Control AI sessions without your mouse
  tagline: A floating desktop app that talks to AI coding assistants running in tmux — entirely from your keyboard.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/yugo-ibuki/unitmux

features:
  - icon: 🖱️
    title: Why "unitmux"?
    details: '"unit" + "tmux" — unite your AI sessions in tmux into a single control panel. Manage multiple AI agents without ever touching your mouse.'
  - icon: 🔍
    title: Auto-Discovery
    details: Automatically finds all AI panes running in tmux. No configuration needed — just open the app and start typing.
  - icon: ⌨️
    title: Keyboard-First
    details: Send input, switch panes, respond to choices, preview output — all without leaving the keyboard. Vim-style navigation in popups.
  - icon: 🎯
    title: Smart Choices
    details: When an AI asks a question with numbered options, clickable buttons appear. Respond with a single keystroke via Ctrl+1-9.
  - icon: 🔀
    title: Multi-Session
    details: Panes are grouped by tmux session. Navigate within and across sessions with keyboard shortcuts. Run multiple AI agents in parallel.
  - icon: 🛠️
    title: Built-in Git
    details: Stage, commit, and push without leaving the app. Press Ctrl+G to open git operations for the selected pane's working directory.
  - icon: 🖼️
    title: Image Attachment
    details: Attach images to your messages via button or drag & drop. Images are sent to Claude CLI through bracketed paste.
  - icon: 🐚
    title: Shell Mode
    details: Toggle shell mode (Ctrl+B) to send commands to a dedicated shell pane alongside your AI session.
  - icon: ⚡
    title: Skill Commands
    details: Skill files from ~/.claude/skills are loaded as slash commands alongside custom slash commands.
---
