# Changelog

## [Unreleased]

### Added
- **Configurable three-state layout focus** — `Tab` cycles balanced, tree-focused, and preview-focused layouts while retaining both panes; ratios and mode availability are configurable through global Pi settings
- **Range selection.** `Shift+V` starts an inclusive range that extends or shrinks with normal tree movement. Starting on an unselected node selects the range, while starting on a selected node deselects it. Copying finishes range mode while preserving its result
- **Global shortcut** — optional `anycopy.shortcut` opens the preview/copy browser directly without clearing the editor draft
- **Selection copy policies** — optional `Enter` modes for output-only or tool-call-inclusive copies, plus four post-copy selection cleanup modes
- **Tool invocation copy action** — optionally enable a separate configurable action that copies matching calls and results in distinct `toolCall:` / `toolResult:` sections while normal copy remains output-only
- **Focused-node block copy**: optionally open a searchable picker for code blocks, Markdown tables, lists, and blockquotes in the focused tree node
- **Multi-block selection**: mark several structural blocks and copy them together in document order, with configurable `never`, `under-three`, and `always` auto-close policies
- **Expandable heading sections**: browse nested Markdown headings as collapsible groups and copy a complete section, including prose and nested content
- **Latest-response structural shortcut**: when block copy is enabled, the configured `keys.copyBlock` binding opens the structural picker directly for the latest non-empty assistant response; the same key still targets the focused node inside `/anycopy`
- **Whole-message copy target**: the latest-response picker includes the complete assistant message as its first target without adding a synthetic row to focused-node tree copy
- **Expandable JSON values**: valid `json` fences expose nested objects, arrays, and scalar values as independently copyable tree targets
- **Selective ordered-list copy**: ordered and unordered lists are separate targets, and ordered lists expose each top-level item with its nested content as an individually copyable child

### Changed
- Key hints now wrap across complete rows instead of truncating the available controls
- Shortcut-opened overlays use `Enter` to copy the focused node instead of showing an unavailable-navigation message
- Custom-entry timestamps use the host's local time zone instead of forcing UTC
- Optional compact hints keep one fixed status row; configurable `?` help uses a connected, color-accented, content-sized table with centered footer controls and separately toggled settings and unavailable actions
- The block picker uses 90% of available terminal width, renders selector and preview side by side when both panes fit, falls back to a stacked narrow layout, and keeps line count in the shared header
- Block-picker height is selection-independent and uses up to 70% of terminal height while reserving host context, without a fixed row ceiling
- Block-picker rows now use heading titles and kind-specific structural metadata instead of generic per-kind ordinals followed by raw first-line snippets
- Filtering temporarily reveals matching heading ancestry without mutating explicit expansion state, and selecting a heading suppresses overlapping nested targets in clipboard output
- Blockquote targets now render their inner Markdown in preview and copy it with one quote level removed, preserving fenced code and nested quote levels
- Key-help and block-picker frames use an explicit muted border color so nested panes remain visually distinct from content
- Block preview uses the configured Shift-scroll and paging bindings; the configured pane-focus key expands split preview to roughly 80% width and dims the selector
- Preview focus exposes Pi's configured `app.editor.external` action, opening the complete selected block in the configured external editor and reading successful edits back into the picker
- External editing now closes the picker before spawning the editor and recreates it afterward, preserving semantic selection, heading expansion, and filter state without stopping and restarting Pi's TUI
- Generic tool-call context can be explicitly enabled for preview without relying on tool names or tool-specific argument schemas

### Fixed
- Returning from the block picker's external editor no longer waits on a manual alternate-screen redraw path
- Generated truncation ellipses in key-help and block-picker panes use the muted frame color instead of inheriting selected-row or syntax-highlight colors
- Block preview overflow indicators are embedded in the viewport borders without truncation artifacts or border-color bleed; they appear only where content is hidden and do not consume content rows
- Custom session entries now use the same readable labeled content for preview and copy instead of raw JSON or a `[custom: type]` placeholder; timestamps and object lists are formatted for people

## [0.3.4] - 2026-08-13

### Fixed
- **Fullscreen preview layout** — `/anycopy` opens over the session view so widgets above the editor do not clip the preview; line and page scrolling reach every preview line, scroll indicators remain accurate, terminal resizing updates the tree and preview layout, and closing restores editor focus. Contributed by [@AdamsGH](https://github.com/AdamsGH)

### Changed
- Requires Pi 0.84.0 or newer

## [0.3.3] - 2026-08-01

### Fixed
- Copy ordering handles deeply nested session trees without overflowing the call stack

### Changed
- Widened Pi compatibility to versions 0.74.0 and newer

## [0.3.1] - 2026-05-15

### Added
- **Node creation timestamps** — `Shift+Ctrl+T` toggles compact creation times beside visible tree nodes, configurable through `keys.toggleEntryTimestamps`

## [0.3.0] - 2026-05-11

### Fixed
- Invalid JSON configuration now reports its parse error instead of silently loading defaults

### Changed
- Updated the anycopy demo

## [0.2.7] - 2026-05-07

### Changed
- Migrated Pi runtime dependencies to the `@earendil-works` package scope

## [0.2.6] - 2026-04-13

### Fixed
- Repeated `Enter` input cannot start duplicate tree navigation
- Selecting the current session leaf reports that the session is already at that point

## [0.2.5] - 2026-04-07

### Changed
- Requires Pi 0.65.0 or newer

## [0.2.4] - 2026-04-07

### Changed
- Label timestamps use Pi's native tree display
- Preview paging defaults to `Shift+PageUp` and `Shift+PageDown`

## [0.2.3] - 2026-04-02

### Fixed
- The npm package includes the fold-state module required for persistent folded branches

## [0.2.2] - 2026-04-02

### Added
- **Persistent folded branches** — Folded state is restored after reopening `/anycopy`, switching branches, or revisiting a session; controlled by `persistFoldState`

### Changed
- Node selection defaults to `Shift+A`, leaving Space available for search input

## [0.2.1] - 2026-03-29

### Added
- **Label timestamps** — `Shift+T` toggles the latest label-change time beside labeled nodes, configurable through `keys.toggleLabelTimestamps`

## [0.2.0] - 2026-03-23

### Added
- **Native tree navigation** — `Enter` navigates to the focused node with Pi's summary choices, cancellation behavior, filters, folding, and labeling

### Fixed
- Configured anycopy shortcuts do not intercept input while editing a node label

### Removed
- The global anycopy shortcut; open the browser with `/anycopy`

## [0.1.4] - 2026-03-14

### Added
- **Configurable global shortcut** — Open and close `/anycopy` without clearing the current editor draft; configured through `shortcut`

## [0.1.3] - 2026-03-05

### Added
- **Initial tree filter** — `treeFilterMode` selects the filter used when `/anycopy` opens: `default`, `no-tools`, `user-only`, `labeled-only`, or `all`

## [0.1.2] - 2026-03-05

### Changed
- Clarified that preview truncation does not affect clipboard output

## [0.1.1] - 2026-03-05

### Fixed
- Clipboard copies include complete node content even when the on-screen preview is truncated

## [0.1.0] - 2026-03-03

### Added
- **Initial release** — Browse the full session tree with syntax-highlighted previews and copy one or more nodes to the clipboard
- Chronological ordering for multi-node copies
- Configurable selection, copy, clear, scrolling, and paging keys
- Native node labeling
