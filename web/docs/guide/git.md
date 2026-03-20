# Git Operations

Press `Ctrl+G` to open the git operations popup for the selected pane's working directory.

## Available Actions

| Action | Description | Shortcut |
|--------|-------------|----------|
| **Add All** | Stage all changes (`git add -A`) | `Ctrl+A` |
| **Commit** | Commit with a message | `Enter` in input |
| **Push** | Push to remote | `Ctrl+P` |

## How It Works

The popup shows:

1. **Current branch** in the header
2. **Git status** (short format) showing changed files
3. **Action buttons** for add, commit, and push

### Workflow

1. Press `Ctrl+G` to open
2. Review the git status
3. Click **Add All** (or `Ctrl+A`) to stage changes
4. Type a commit message and press `Enter`
5. Click **Push** (or `Ctrl+P`) to push

The git status refreshes automatically after each operation.

## Requirements

Git operations use the pane's current working directory. The popup only appears when the pane's CWD is inside a git repository.
