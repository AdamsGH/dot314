# anycopy for Pi (`pi-anycopy`)

This extension mirrors all the behaviors of Pi's native `/tree` while adding a live, syntax-highlighting preview of each node's content, the ability to copy any node(s) to the clipboard, and optional node creation timestamps.

<p align="center">
  <img width="450" alt="anycopy demo" src="https://raw.githubusercontent.com/w-winter/dot314/main/assets/anycopy-demo.gif" />
</p>

## Install

From npm:

```bash
pi install npm:pi-anycopy
```

From the dot314 git bundle (filtered install):

Add to `~/.pi/agent/settings.json` (or replace an existing unfiltered `git:github.com/w-winter/dot314` entry):

```json
{
  "packages": [
    {
      "source": "git:github.com/w-winter/dot314",
      "extensions": ["extensions/anycopy/index.ts"],
      "skills": [],
      "themes": [],
      "prompts": []
    }
  ]
}
```

Restart Pi after installation.

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
| `Shift+B` | Open structural copy for the focused `/anycopy` node, or the latest assistant response outside `/anycopy` |
| `Shift+X` | Clear selection |
| `Shift+L` | Label node (native tree behavior) |
| `Shift+T` | Toggle label timestamps for labeled nodes |
| `Shift+Ctrl+T` | Toggle node creation timestamps |
| `Tab` | Cycle balanced, tree-focused, and preview-focused layouts when layout modes are enabled |
| `Shift+V` | Start or finish range selection or deselection. Move through the tree to extend the range |
| `Shift+Up` / `Shift+Down` | Scroll node preview by line |
| `Shift+PageUp` / `Shift+PageDown` | Page through node preview |
| `Shift+I` | Toggle generic parent tool-call context in preview |
| `?` | Open effective keybinding help |
| `Esc` | Close |

Notes:
- Full key hints wrap across complete rows; `anycopy.hints.mode: "compact"` replaces them with one fixed status/help row so selection and copy feedback do not resize the panes
- `?` opens compact key help; inside it, `S` toggles exact `anycopy.*` setting paths and `U` toggles unavailable actions with their dependency
- `Tab` cycles through balanced, tree-focused, and preview-focused layouts; both panes remain visible according to configurable ratios
- Range mode selects when its anchor is unselected and deselects when its anchor is already selected. Normal tree movement extends or shrinks the inclusive range while preserving selections outside it
- Changing the visible tree through search, filtering, or folding finishes the active range while keeping nodes already selected
- `Enter` navigates the focused node in command-opened overlays; when shortcut-opened navigation is unavailable, it copies the focused node without requiring selection; `anycopy.selection.enterCopyMode` can copy marked results, with or without matching tool calls
- After `Enter`, `/anycopy` offers the same summary choices as `/tree`: `No summary`, `Summarize`, and `Summarize with custom prompt`
- If `branchSummary.skipPrompt` is `true` in Pi settings, `/anycopy` matches native `/tree` and skips the summary chooser, defaulting to no summary
- Escaping the summary chooser reopens `/anycopy` with focus restored to the node you tried to select
- Cancelling the custom summarization editor returns to the summary chooser
- `Shift+C` finishes active range selection after copying while keeping the selected nodes marked
- Optional structural copy uses one searchable picker for Markdown heading sections, fenced code, tables, ordered and unordered lists, and blockquotes
- Ordered lists expand into individually copyable top-level items. Each item keeps its nested bullets and continuation lines, while unordered lists remain one copy target
- When `anycopy.copy.enableBlockCopy` is `true`, the configured `anycopy.keys.copyBlock` shortcut opens that picker directly for the latest non-empty assistant response; inside `/anycopy`, the same key uses the focused tree node
- Heading rows form a collapsed hierarchy by Markdown level; `Right` expands a section, `Left` collapses it or selects its parent, and filtering temporarily reveals matching ancestry without changing explicit expansion state
- `Enter` on a heading copies the complete raw Markdown section, including its heading, prose, nested headings, and structural content; selecting a heading suppresses overlapping nested selections in the copied result
- Inside the picker, the configured selection key (`Shift+A` by default) marks or unmarks sections and blocks, while `Enter` copies marked targets in document order or the focused target when nothing is marked; plain spaces remain available in filter queries
- Selector rows use structural summaries instead of raw first-line snippets: headings show aggregate block/line counts, code shows language/lines, tables show dimensions, ordered and unordered lists show distinct labels and top-level item counts, and quotes show line counts
- `anycopy.copy.blockPicker.autoClose` controls whether marking immediately copies and closes: `never`, `under-three` (the default, when the source node has one or two copy targets), or `always`
- The picker uses 90% of available terminal width and up to 70% of terminal height, with no fixed row ceiling. It scrolls preview with the configured `Shift+Up`/`Shift+Down` and `Shift+PageUp`/`Shift+PageDown` bindings, and switches between stacked and split layouts by available width
- In split layout, the configured pane-focus key (`Tab` by default) expands preview to roughly 80% width and dims the selector; press it again to restore selector focus
- While preview is focused on a non-heading block, Pi's configured `app.editor.external` binding (`Ctrl+G` by default) closes the picker before opening the complete focused block in the configured external editor, then recreates the picker with its filter, focus, expansion, marks, and edited content restored
- Structural copy preserves raw Markdown for heading sections, tables, lists, and list items. Blockquotes copy as clean Markdown with one quote level removed, so their inline formatting and fenced code still render in preview without `>` prefixes in the clipboard. Standalone fenced code copies without its outer fence. Multiple non-overlapping targets are separated by one blank line
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
      "enableToolCallCopy": false,
      "enableBlockCopy": false,
      "blockPicker": {
        "autoClose": "under-three"
      }
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
      "copyBlock": "shift+b",
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
- `anycopy.copy.enableBlockCopy`: when `true`, registers `keys.copyBlock` globally for the latest assistant response and enables the same action for the focused `/anycopy` node; when `false`, no global block-copy shortcut is registered
- `anycopy.copy.blockPicker.autoClose`: `never` keeps the picker open while marking, `under-three` closes after marking when the unfiltered copy-target count is below three, and `always` closes after every new mark
- `anycopy.hints.mode`: `full` shows wrapped inline bindings; `compact` reserves one row for stable status and the configured help key
- `anycopy.preview.toolCallContext`: opt-in initial state for generic tool-call context in preview; it is `false` by default and can be toggled at runtime with `keys.toggleToolCallContext`
- `anycopy.keys`: effective bindings for anycopy-owned actions; the help popup reads these merged values instead of hardcoded defaults

Ratios are applied after native tree chrome, status, and wrapped hints are measured. If the tree has fewer visible entries than its allocation, preview receives the unused rows instead of leaving a blank area. Run `/reload` after changing these settings.

The extension-local `config.json` remains a fallback for existing installations, but global `settings.json` takes precedence.
