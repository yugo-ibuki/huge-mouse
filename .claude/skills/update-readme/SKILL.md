---
name: update-readme
description: Automatically update README.md (and README.ja.md if present) after implementing features, changing keybindings, modifying settings, or altering user-facing behavior. Use this skill whenever you've just finished implementation work that changes how the user interacts with the app — new shortcuts, removed features, changed UI, new settings, modified commands. Even small changes like swapping Cmd for Ctrl in a keybinding should trigger this. Also use when the user explicitly says "update the README" or "sync the docs".
---

# Update README

Keep project README files accurate and in sync with the actual codebase after implementation changes.

## Why this matters

Outdated READMEs mislead users and create friction. Every user-facing change — a new shortcut, a renamed setting, a removed feature — should be reflected in the docs immediately, while the change is fresh in context.

## When this triggers

After completing implementation work that affects any of:

- Keyboard shortcuts or keybindings
- UI elements (buttons, settings, toggles)
- New features or removed features
- Changed behavior (e.g., detection logic, default values)
- CLI commands or install instructions
- Requirements or dependencies

## Process

### 1. Identify what changed

Use `git diff` (or the conversation context if uncommitted) to understand what user-facing behavior changed. Focus on:

- New or modified keybindings
- New or changed settings/preferences
- Added, removed, or renamed UI elements
- Changed detection or interaction patterns
- New dependencies or requirements

### 2. Read current READMEs

Read all README files in the project root:

- `README.md` (English)
- `README.ja.md` (Japanese) — if it exists

Both files must stay in sync. If one exists but the other doesn't, only update the one that exists.

### 3. Update surgically

Apply minimal, targeted edits — don't rewrite sections that haven't changed. For each change:

- **New feature**: Add it to the relevant existing section. Don't create new sections unless the feature doesn't fit anywhere.
- **Changed behavior**: Update the description in place.
- **New keybinding**: Add a row to the keyboard shortcuts table.
- **Changed keybinding**: Update the existing row.
- **Removed feature**: Remove the mention. Don't leave "removed in vX.X" notes.
- **New setting**: Add to the Settings section.

### 4. Maintain both languages

When updating README.ja.md, translate naturally — don't machine-translate literally. Match the tone and structure of the existing Japanese text.

### 5. Verify consistency

After editing, quickly scan both READMEs to confirm:

- The same features are documented in both
- Tables have the same rows
- No stale references to old behavior remain

## Style guidelines

- Keep it concise. Users scan READMEs, they don't read them cover to cover.
- Use tables for shortcuts and indicators — they're scannable.
- Don't add version history or changelogs to the README.
- Don't add implementation details — only document what the user sees and does.
- Preserve the existing structure and formatting conventions.
