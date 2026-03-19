# Add tmux session creation and termination from the app

## Summary

Add the ability to create new tmux sessions and terminate existing ones directly from the huge-mouse UI.

## Feature Details

### Create a new tmux session (Ctrl+N)

- Pressing **Ctrl+N** opens a session creation dialog.
- The dialog allows the user to select which existing tmux session to create a new window/pane in.
- A new `claude` or `codex` session is started in the selected tmux session.

### Terminate a tmux session (Ctrl+D / detail view)

- Pressing **Ctrl+D** opens a detail/info panel for the currently selected pane.
- The detail panel includes a **Close** button to terminate the session.
- Pressing **Ctrl+C** while the detail panel is open triggers a **confirmation dialog** asking the user whether they really want to close the session.
  - If confirmed, the session is terminated.
  - If cancelled, the detail panel remains open.

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Open session creation dialog | Ctrl+N |
| Open session detail panel | Ctrl+D |
| Close session (with confirmation) | Ctrl+C (while detail panel is open) |

## Acceptance Criteria

- [ ] Ctrl+N opens a dialog to create a new tmux session, with a selector for the target session
- [ ] New session is created in the selected tmux session
- [ ] Ctrl+D opens a detail panel for the currently selected pane
- [ ] Detail panel has a button to close/terminate the session
- [ ] Ctrl+C while detail panel is open shows a confirmation dialog before closing the session
- [ ] Pane list refreshes after session creation or termination
- [ ] New IPC channels are added for session creation and termination
