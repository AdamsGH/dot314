# anycopy

This extension mirrors all the behaviors of Pi's native `/tree` while adding a live, syntax-highlighting preview of each node's content, the ability to copy any node(s) to the clipboard, and optional node creation timestamps.

## Usage

```text
/anycopy
```

## Keys

Defaults (customizable under `anycopy.keys` in global `settings.json`):

| Key | Action |
|-----|--------|
| `Enter` | Navigate in command-opened overlays; copy the focused node in shortcut-opened overlays; optionally copy marked nodes |
| `Shift+A` | Select/unselect focused node for copy |
| `Shift+C` | Copy selected nodes, or the focused node if nothing is selected |
| `Shift+Alt+C` | Copy with matching tool calls when the optional feature is enabled |
| `Shift+X` | Clear selection |
| `Shift+L` | Label node (native tree behavior) |
| `Shift+T` | Toggle label timestamps for labeled nodes |
| `Shift+Ctrl+T` | Toggle node creation timestamps |
| `Tab` | Cycle balanced, tree-focused, and preview-focused layouts when layout modes are enabled |
| `Shift+V` | Start or finish range selection; move through the tree to extend the range |
| `Shift+Up` / `Shift+Down` | Scroll node preview by line |
| `Shift+PageUp` / `Shift+PageDown` | Page through node preview |
| `Shift+I` | Toggle generic parent tool-call context in preview |
| `?` | Open effective keybinding help |
| `Esc` | Close |

Notes:
- Full key hints wrap across complete rows; `anycopy.hints.mode: "compact"` replaces them with one fixed status/help row so selection and copy feedback do not resize the panes
- `?` opens compact key help; inside it, `S` toggles exact `anycopy.*` setting paths and `U` toggles unavailable actions with their dependency
- `Tab` cycles through balanced, tree-focused, and preview-focused layouts; both panes remain visible according to configurable ratios
- While range selection is active, normal tree movement extends or shrinks an inclusive range from the original node; existing selections outside the range are preserved
- Changing the visible tree through search, filtering, or folding finishes the active range while keeping nodes already selected
- `Enter` navigates the focused node in command-opened overlays; when shortcut-opened navigation is unavailable, it copies the focused node without requiring selection; `anycopy.selection.enterCopyMode` can copy marked results, with or without matching tool calls
- After `Enter`, `/anycopy` offers the same summary choices as `/tree`: `No summary`, `Summarize`, and `Summarize with custom prompt`
- If `branchSummary.skipPrompt` is `true` in Pi settings, `/anycopy` matches native `/tree` and skips the summary chooser, defaulting to no summary
- Escaping the summary chooser reopens `/anycopy` with focus restored to the node you tried to select
- Cancelling the custom summarization editor returns to the summary chooser
- `Shift+C` finishes active range selection after copying while keeping the selected nodes marked
- If no nodes are selected, `Shift+C` copies the focused node
- Single-node copies use just that node's content; role prefixes like `user:` or `assistant:` are only added when copying 2 or more nodes
- When copying multiple selected nodes, they are auto-sorted chronologically by position in the session tree, not by selection order
- `Shift+A`/`Shift+C` multi-select copy behavior is unchanged by navigation support, while plain space remains available for search queries
- `/anycopy` opens over the session view, so widgets above the editor do not reduce the space available to its preview
- The optional global shortcut opens the browser directly without clearing the editor draft; Pi exposes tree navigation only to command handlers, so navigation remains available when opened through `/anycopy`, while shortcut-opened overlays are intended for preview and copy
- Replacing native `/tree` is intentionally not offered: Pi currently exposes no public command/hotkey override hook, and private `InteractiveMode` monkey-patching would be brittle
- `Shift+T` is configurable via `anycopy.keys.toggleLabelTimestamps` in global `settings.json`
- `Shift+T` shows timestamps for labeled nodes only, using the latest label-change time for each label
- `Shift+Ctrl+T` is configurable via `anycopy.keys.toggleEntryTimestamps` in global `settings.json`
- `Shift+Ctrl+T` shows each node's creation time right-aligned at the far right of each visible tree row
- Nodes without a creation time show no timestamp
- Timestamps use a compact format: same-day `HH:MM`, same-year `M/D HH:MM`, cross-year `YY/M/D HH:MM`
- Label edits are persisted via `pi.setLabel(...)`
- [Folded](https://github.com/badlogic/pi-mono/blob/09e9de5749193beab234f30ed220a77f3d91cfad/packages/coding-agent/docs/tree.md#controls) branches are persisted by default in hidden `/anycopy` session entries, so closing/reopening `/anycopy`, switching to a sibling branch, or revisiting the session later restores the same folded view until you explicitly unfold it again
- Search and filter changes still reset the live overlay's fold state temporarily; reopening `/anycopy` restores the persisted folded branches

## Configuration

Add an `anycopy` section to the normal global Pi settings file at `~/.pi/agent/settings.json`:

```json
{
  "anycopy": {
    "treeFilterMode": "default",
    "persistFoldState": true,
    "shortcut": null,
    "layout": {
      "enabled": true,
      "balancedTreeRatio": 0.5,
      "treeFocusTreeRatio": 0.85,
      "previewFocusTreeRatio": 0.15
    },
    "selection": {
      "enterCopyMode": "off",
      "clearAfterCopy": "never"
    },
    "copy": {
      "enableToolCallCopy": false
    },
    "hints": {
      "mode": "full"
    },
    "preview": {
      "toolCallContext": false
    },
    "keys": {
      "toggleSelect": "shift+a",
      "copy": "shift+c",
      "copyWithToolCall": "shift+alt+c",
      "clear": "shift+x",
      "toggleLabelTimestamps": "shift+t",
      "toggleEntryTimestamps": "shift+ctrl+t",
      "togglePaneFocus": "tab",
      "toggleRangeSelection": "shift+v",
      "scrollUp": "shift+up",
      "scrollDown": "shift+down",
      "pageUp": "shift+pageup",
      "pageDown": "shift+pagedown",
      "toggleToolCallContext": "shift+i",
      "helpToggleSettings": "s",
      "helpToggleUnavailable": "u",
      "help": "?"
    }
  }
}
```

- `anycopy.treeFilterMode`: initial tree filter; one of `default`, `no-tools`, `user-only`, `labeled-only`, or `all`
- `anycopy.persistFoldState`: persists explicitly folded branches when `true`
- `anycopy.shortcut`: optional global shortcut registered through Pi's extension shortcut API; `null` disables it
- `anycopy.layout.enabled`: enables the three-state `Tab` cycle; when `false`, the balanced layout remains fixed and `/anycopy` does not claim the configured layout key
- `anycopy.layout.*TreeRatio`: fraction of free pane rows assigned to the tree in each layout; values must be greater than `0` and less than `1`, and the remaining rows go to preview
- `anycopy.selection.enterCopyMode`: controls `Enter` while nodes are marked: `off` navigates normally, `output` copies only results, and `output-with-tool-call` copies matching calls with their results
- `anycopy.selection.clearAfterCopy`: selection cleanup policy: `never`, `always`, `multi-select`, or `multi-select-enter`
- `anycopy.copy.enableToolCallCopy`: when `true`, adds the configurable `copyWithToolCall` action and hint; copied pairs use separate `toolCall:` and `toolResult:` sections, while normal copies remain output-only
- `anycopy.hints.mode`: `full` shows wrapped inline bindings; `compact` reserves one row for stable status and the configured help key
- `anycopy.preview.toolCallContext`: opt-in initial state for generic tool-call context in preview; it is `false` by default and can be toggled at runtime with `keys.toggleToolCallContext`
- `anycopy.keys`: effective bindings for anycopy-owned actions; the help popup reads these merged values instead of hardcoded defaults

Ratios are applied after native tree chrome, status, and wrapped hints are measured. If the tree has fewer visible entries than its allocation, preview receives the unused rows instead of leaving a blank area. Run `/reload` after changing these settings.

The extension-local `config.json` remains a fallback for existing installations, but global `settings.json` takes precedence.

For npm installation and package-specific docs, see [`packages/pi-anycopy/README.md`](../../packages/pi-anycopy/README.md)
