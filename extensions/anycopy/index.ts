/**
 * anycopy — browse session tree nodes with preview and copy any of them
 *
 * Layout: native TreeSelectorComponent at top, status bar, preview below
 *
 * Default keys (customizable via anycopy.keys in global settings.json):
 *   Shift+A   - select/unselect focused node for copy
 *   Shift+C   - copy selected nodes (or focused node if none selected)
 *   Shift+Alt+C - optionally copy selected nodes with matching tool calls
 *   Shift+B   - optionally copy a section/block from the focused node or latest assistant response
 *   Shift+X   - clear selection
 *   Shift+L   - label node
 *   Shift+T   - toggle label timestamps for labeled nodes
 *   Shift+Ctrl+T - toggle entry-created timestamps for visible tree rows
 *   Tab       - cycle balanced, tree-focused, and preview-focused layouts
 *   Shift+V   - start/finish range selection; move to extend the range
 *   Shift+↑/↓ - scroll preview
 *   Shift+PageUp/PageDown - page preview
 *   Esc       - close
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	copyToClipboard,
	getLanguageFromPath,
	getMarkdownTheme,
	highlightCode,
	TreeSelectorComponent,
} from "@earendil-works/pi-coding-agent";

import {
	getKeybindings,
	Markdown,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { Focusable } from "@earendil-works/pi-tui";

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import {
	attemptClipboardCopy,
	DEFAULT_LARGE_PAYLOAD_OSC52_MAX_BYTES,
	type ClipboardCopyOptions,
} from "./clipboard-copy.ts";
import { formatCustomEntryContent, formatCustomEntryPreview } from "./custom-entry.ts";
import { createAnycopyEnterNavigationLauncher, runAnycopyEnterNavigation } from "./enter-navigation.ts";
import { AnycopyKeyHelp } from "./key-help.ts";
import { getLastAssistantText, resolveLatestAssistantCopyShortcut } from "./last-assistant.ts";
import {
	formatCompactKey,
	getKeyHelpPreferredWidth,
	type KeyHelpRow,
} from "./key-help-data.ts";
import { getPreviewPageStep, getPreviewWindow } from "./preview-window.ts";
import { formatCompactTimestamp, getEntryTimestampMs } from "./timestamps.ts";
import {
	buildToolContextPreview,
	type ToolContextPreview,
} from "./tool-context-preview.ts";
import { buildNodeOrder } from "./tree-order.ts";
import {
	addWholeMessageStructuralTarget,
	DEFAULT_STRUCTURAL_BLOCK_PICKER_AUTO_CLOSE,
	extractStructuralBlocks,
	joinStructuralBlocksForClipboard,
	type StructuralBlock,
	type StructuralBlockPickerAutoClose,
} from "./structural-copy.ts";
import { pickStructuralBlocks } from "./structural-copy-overlay.ts";
import {
	formatToolCallResultForClipboard,
	getToolName,
	resolveToolCallFromParents,
} from "./tool-call-copy.ts";
import {
	type ClearSelectionAfterCopy,
	type CopyTrigger,
	type EnterCopyMode,
	type HintMode,
	type PaneFocus,
	type RangeSelectionMode,
	buildStatusTextLines,
	resolveEnterAction,
	applyInclusiveRangeSelection,
	shouldClearSelectionAfterCopy,
	togglePaneFocus,
} from "./ui-state.ts";
import {
	getAnycopyRenderHeight,
	getAnycopyTreeHeight,
	getAnycopyTreeVisibleLines,
	type PaneLayoutRatios,
} from "./viewport-layout.ts";
import {
	ANYCOPY_FOLD_STATE_CUSTOM_TYPE,
	createFoldStateEntryData,
	foldStateNodeIdListsEqual,
	getSelectorFoldedNodeIds,
	loadLatestFoldStateFromEntries,
	mergeExplicitFoldMutation,
	normalizeFoldedNodeIds,
	setSelectorFoldedNodeIds,
} from "./fold-state.ts";

type SessionTreeNode = {
	entry: SessionEntry;
	children: SessionTreeNode[];
	label?: string;
};

type anycopyTreeList = ReturnType<TreeSelectorComponent["getTreeList"]>;

type anycopyTreeListInternals = {
	filteredNodes: Array<{ node: SessionTreeNode }>;
	selectedIndex: number;
	maxVisibleLines: number;
	showLabelTimestamps: boolean;
};

type MatchesKeyId = Parameters<typeof matchesKey>[1];

type anycopyKeyConfig = {
	toggleSelect: string;
	copy: string;
	copyWithToolCall: string;
	copyBlock: string;
	clear: string;
	toggleLabelTimestamps: string;
	toggleEntryTimestamps: string;
	togglePaneFocus: string;
	toggleRangeSelection: string;
	scrollDown: string;
	scrollUp: string;
	pageDown: string;
	pageUp: string;
	toggleToolCallContext: string;
	helpToggleSettings: string;
	helpToggleUnavailable: string;
	help: string;
};

type TreeFilterMode = "default" | "no-tools" | "user-only" | "labeled-only" | "all";

type PaneLayoutConfig = {
	enabled?: boolean;
	balancedTreeRatio?: number;
	treeFocusTreeRatio?: number;
	previewFocusTreeRatio?: number;
};

type SelectionConfig = {
	enterCopyMode?: EnterCopyMode;
	debugToolEnvelopes?: boolean;
	/** Compatibility with the initial pane-controls configuration. */
	enterCopiesSelection?: boolean;
	clearAfterCopy?: ClearSelectionAfterCopy;
	rangeMode?: RangeSelectionMode;
};

type SelectionRuntimeConfig = {
	enterCopyMode: EnterCopyMode;
	debugToolEnvelopes: boolean;
	clearAfterCopy: ClearSelectionAfterCopy;
	rangeMode: RangeSelectionMode;
};

type CopyConfig = {
	enableToolCallCopy?: boolean;
	enableBlockCopy?: boolean;
	largePayloadOsc52MaxBytes?: number;
	blockPicker?: {
		autoClose?: StructuralBlockPickerAutoClose;
	};
};

type HintsConfig = {
	mode?: HintMode;
};

type PreviewConfig = {
	toolCallContext?: boolean;
};

type anycopyConfig = {
	keys?: Partial<anycopyKeyConfig>;
	shortcut?: string | null;
	layout?: PaneLayoutConfig;
	selection?: SelectionConfig;
	copy?: CopyConfig;
	hints?: HintsConfig;
	preview?: PreviewConfig;
	treeFilterMode?: TreeFilterMode;
	persistFoldState?: boolean;
};

type anycopyRuntimeConfig = {
	keys: anycopyKeyConfig;
	shortcut: string | null;
	layoutEnabled: boolean;
	layoutRatios: PaneLayoutRatios;
	selection: SelectionRuntimeConfig;
	toolCallCopyEnabled: boolean;
	blockCopyEnabled: boolean;
	clipboardCopyOptions: ClipboardCopyOptions;
	blockPickerAutoClose: StructuralBlockPickerAutoClose;
	initialToolCallContext: boolean;
	hintMode: HintMode;
	treeFilterMode: TreeFilterMode;
	persistFoldState: boolean;
};

type AnycopySettingsFile = {
	anycopy?: anycopyConfig;
};

type BranchSummarySettingsFile = {
	branchSummary?: {
		skipPrompt?: boolean;
	};
};

const DEFAULT_KEYS: anycopyKeyConfig = {
	toggleSelect: "shift+a",
	copy: "shift+c",
	copyWithToolCall: "shift+alt+c",
	copyBlock: "shift+b",
	clear: "shift+x",
	toggleLabelTimestamps: "shift+t",
	toggleEntryTimestamps: "shift+ctrl+t",
	togglePaneFocus: "tab",
	toggleRangeSelection: "shift+v",
	scrollDown: "shift+down",
	scrollUp: "shift+up",
	pageDown: "shift+pagedown",
	pageUp: "shift+pageup",
	toggleToolCallContext: "shift+i",
	helpToggleSettings: "s",
	helpToggleUnavailable: "u",
	help: "?",
};

const DEFAULT_TREE_FILTER_MODE: TreeFilterMode = "default";
const DEFAULT_PERSIST_FOLD_STATE = true;
const DEFAULT_SHORTCUT = null;
const DEFAULT_LAYOUT_ENABLED = true;
const DEFAULT_LAYOUT_RATIOS: PaneLayoutRatios = {
	balanced: 0.5,
	tree: 0.85,
	preview: 0.15,
};
const DEFAULT_SELECTION_CONFIG: SelectionRuntimeConfig = {
	enterCopyMode: "off",
	debugToolEnvelopes: false,
	clearAfterCopy: "never",
	rangeMode: "toggle",
};

const getExtensionDir = (): string => {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (typeof __dirname !== "undefined") return __dirname;
	// @ts-ignore import.meta is available in Pi's ESM extension runtime; the standalone verifier also checks CJS output.
	return dirname(fileURLToPath(import.meta.url));
};

const getAgentDir = (): string => process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

const readJsonFile = <T>(path: string): T | undefined => {
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, "utf8")) as T;
};

const loadBranchSummarySkipPrompt = (cwd: string): boolean => {
	const globalSettings = readJsonFile<BranchSummarySettingsFile>(join(getAgentDir(), "settings.json"));
	const projectSettings = readJsonFile<BranchSummarySettingsFile>(join(cwd, ".pi", "settings.json"));
	const projectSkipPrompt = projectSettings?.branchSummary?.skipPrompt;
	if (typeof projectSkipPrompt === "boolean") return projectSkipPrompt;

	const globalSkipPrompt = globalSettings?.branchSummary?.skipPrompt;
	return typeof globalSkipPrompt === "boolean" ? globalSkipPrompt : false;
};

const normalizePaneRatio = (value: unknown, fallback: number): number =>
	typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;

const normalizeNonNegativeInteger = (value: unknown, fallback: number): number =>
	typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;

const loadConfig = (): anycopyRuntimeConfig => {
	const extensionConfig = readJsonFile<anycopyConfig>(join(getExtensionDir(), "config.json")) ?? {};
	const settingsConfig =
		readJsonFile<AnycopySettingsFile>(join(getAgentDir(), "settings.json"))?.anycopy ?? {};
	const parsed: anycopyConfig = {
		...extensionConfig,
		...settingsConfig,
		keys: { ...extensionConfig.keys, ...settingsConfig.keys },
		layout: { ...extensionConfig.layout, ...settingsConfig.layout },
		selection: { ...extensionConfig.selection, ...settingsConfig.selection },
		copy: {
			...extensionConfig.copy,
			...settingsConfig.copy,
			blockPicker: {
				...extensionConfig.copy?.blockPicker,
				...settingsConfig.copy?.blockPicker,
			},
		},
		hints: { ...extensionConfig.hints, ...settingsConfig.hints },
		preview: { ...extensionConfig.preview, ...settingsConfig.preview },
	};

	const keys: anycopyKeyConfig = { ...DEFAULT_KEYS };
	if (parsed.keys) {
		for (const key of Object.keys(DEFAULT_KEYS) as Array<keyof anycopyKeyConfig>) {
			const value = parsed.keys[key];
			if (typeof value === "string") keys[key] = value;
		}
	}

	const validTreeFilterModes: TreeFilterMode[] = ["default", "no-tools", "user-only", "labeled-only", "all"];
	const treeFilterMode =
		typeof parsed.treeFilterMode === "string" && validTreeFilterModes.includes(parsed.treeFilterMode as TreeFilterMode)
			? (parsed.treeFilterMode as TreeFilterMode)
			: DEFAULT_TREE_FILTER_MODE;
	const persistFoldState =
		typeof parsed.persistFoldState === "boolean" ? parsed.persistFoldState : DEFAULT_PERSIST_FOLD_STATE;
	const shortcut = typeof parsed.shortcut === "string" && parsed.shortcut.trim() ? parsed.shortcut.trim() : null;
	const layoutEnabled = typeof parsed.layout?.enabled === "boolean" ? parsed.layout.enabled : DEFAULT_LAYOUT_ENABLED;
	const layoutRatios: PaneLayoutRatios = {
		balanced: normalizePaneRatio(parsed.layout?.balancedTreeRatio, DEFAULT_LAYOUT_RATIOS.balanced),
		tree: normalizePaneRatio(parsed.layout?.treeFocusTreeRatio, DEFAULT_LAYOUT_RATIOS.tree),
		preview: normalizePaneRatio(parsed.layout?.previewFocusTreeRatio, DEFAULT_LAYOUT_RATIOS.preview),
	};
	const validClearAfterCopyModes: ClearSelectionAfterCopy[] = [
		"never",
		"always",
		"always-enter",
		"multi-select",
		"multi-select-enter",
	];
	const validEnterCopyModes: EnterCopyMode[] = ["off", "output", "output-with-tool-call"];
	const validRangeSelectionModes: RangeSelectionMode[] = ["toggle", "select"];
	const configuredEnterCopyMode = parsed.selection?.enterCopyMode;
	const selection: SelectionRuntimeConfig = {
		enterCopyMode:
			typeof configuredEnterCopyMode === "string" &&
			validEnterCopyModes.includes(configuredEnterCopyMode as EnterCopyMode)
				? (configuredEnterCopyMode as EnterCopyMode)
				: parsed.selection?.enterCopiesSelection === true
					? "output"
					: DEFAULT_SELECTION_CONFIG.enterCopyMode,
		debugToolEnvelopes: parsed.selection?.debugToolEnvelopes === true,
		clearAfterCopy:
			typeof parsed.selection?.clearAfterCopy === "string" &&
			validClearAfterCopyModes.includes(parsed.selection.clearAfterCopy as ClearSelectionAfterCopy)
				? (parsed.selection.clearAfterCopy as ClearSelectionAfterCopy)
				: DEFAULT_SELECTION_CONFIG.clearAfterCopy,
		rangeMode:
			typeof parsed.selection?.rangeMode === "string" &&
			validRangeSelectionModes.includes(parsed.selection.rangeMode as RangeSelectionMode)
				? (parsed.selection.rangeMode as RangeSelectionMode)
				: DEFAULT_SELECTION_CONFIG.rangeMode,
	};

	const toolCallCopyEnabled = parsed.copy?.enableToolCallCopy === true;
	const blockCopyEnabled = parsed.copy?.enableBlockCopy === true;
	const clipboardCopyOptions: ClipboardCopyOptions = {
		largePayloadOsc52MaxBytes: normalizeNonNegativeInteger(
			parsed.copy?.largePayloadOsc52MaxBytes,
			DEFAULT_LARGE_PAYLOAD_OSC52_MAX_BYTES,
		),
	};
	const validBlockPickerAutoCloseModes: StructuralBlockPickerAutoClose[] = [
		"never",
		"under-three",
		"always",
	];
	const configuredBlockPickerAutoClose = parsed.copy?.blockPicker?.autoClose;
	const blockPickerAutoClose =
		typeof configuredBlockPickerAutoClose === "string" &&
		validBlockPickerAutoCloseModes.includes(
			configuredBlockPickerAutoClose as StructuralBlockPickerAutoClose,
		)
			? (configuredBlockPickerAutoClose as StructuralBlockPickerAutoClose)
			: DEFAULT_STRUCTURAL_BLOCK_PICKER_AUTO_CLOSE;
	const initialToolCallContext = parsed.preview?.toolCallContext === true;
	const hintMode: HintMode = parsed.hints?.mode === "compact" ? "compact" : "full";

	return {
		keys,
		shortcut,
		layoutEnabled,
		layoutRatios,
		selection,
		toolCallCopyEnabled,
		blockCopyEnabled,
		clipboardCopyOptions,
		blockPickerAutoClose,
		initialToolCallContext,
		hintMode,
		treeFilterMode,
		persistFoldState,
	};
};

const pluralizeNode = (count: number): string => (count === 1 ? "node" : "nodes");

const MAX_PREVIEW_CHARS = 7000;
const MAX_PREVIEW_LINES = 200;
const FLASH_DURATION_MS = 2000;
const TREE_SELECTOR_PROBE_ROWS = 1;

const getTextContent = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(b): b is { type: "text"; text: string } =>
				typeof b === "object" && b !== null && (b as { type?: string }).type === "text",
		)
		.map((b) => b.text)
		.join("");
};

const clipTextForPreview = (text: string): string => {
	if (text.length <= MAX_PREVIEW_CHARS) return text;
	return `${text.slice(0, MAX_PREVIEW_CHARS)}\n… [truncated]`;
};

/** Role/type label for clipboard display */
const getEntryRoleLabel = (entry: SessionEntry): string => {
	if (entry.type === "message") {
		return (entry.message as { role?: string }).role ?? "message";
	}
	if (entry.type === "custom_message") return entry.customType;
	return entry.type;
};

/** Plain text content for clipboard and preview (no metadata) */
const getEntryContent = (entry: SessionEntry): string => {
	switch (entry.type) {
		case "message": {
			const msg = entry.message as {
				role?: string;
				content?: unknown;
				command?: string;
				errorMessage?: string;
			};
			if (msg.role === "bashExecution" && msg.command) return msg.command;
			if (msg.errorMessage) return `(error) ${msg.errorMessage}`;
			return getTextContent(msg.content).trim() || "(no text content)";
		}
		case "custom_message": {
			if (typeof entry.content === "string") {
				return entry.content || "(no text content)";
			}
			if (!Array.isArray(entry.content)) {
				return "(no text content)";
			}

			const content = entry.content
				.filter(
					(b): b is { type: "text"; text: string } =>
						typeof b === "object" &&
						b !== null &&
						(b as { type?: string }).type === "text" &&
						typeof (b as { text?: unknown }).text === "string",
				)
				.map((b) => b.text)
				.join("");
			return content || "(no text content)";
		}
		case "compaction":
			return entry.summary;
		case "branch_summary":
			return entry.summary;
		case "custom":
			return formatCustomEntryContent(entry.customType, entry.data);
		case "label":
			return `label: ${entry.label ?? "(cleared)"}`;
		case "model_change":
			return `${entry.provider}/${entry.modelId}`;
		case "thinking_level_change":
			return entry.thinkingLevel;
		case "session_info":
			return entry.name ?? "(unnamed)";
		default:
			return "";
	}
};

const getPreviewEntryContent = (entry: SessionEntry): string =>
	entry.type === "custom" ? formatCustomEntryPreview(entry.customType, entry.data) : getEntryContent(entry);

type StructuralCopyResult =
	| { type: "empty" }
	| { type: "cancelled" }
	| { type: "copied"; selected: StructuralBlock[] }
	| { type: "failed"; error: string };

const selectAndCopyStructuralBlocks = async (
	blocks: readonly StructuralBlock[],
	openPicker: (blocks: readonly StructuralBlock[]) => Promise<StructuralBlock[] | null>,
	clipboardCopyOptions: ClipboardCopyOptions,
): Promise<StructuralCopyResult> => {
	if (blocks.length === 0) return { type: "empty" };

	try {
		const selected = await openPicker(blocks);
		if (!selected || selected.length === 0) return { type: "cancelled" };

		const copyResult = await attemptClipboardCopy(
			joinStructuralBlocksForClipboard(selected),
			copyToClipboard,
			clipboardCopyOptions,
		);
		if (!copyResult.ok) return { type: "failed", error: copyResult.error };
		return { type: "copied", selected };
	} catch (error) {
		return {
			type: "failed",
			error: error instanceof Error ? error.message : "Failed to open structural copy picker",
		};
	}
};

const replaceTabs = (text: string): string => text.replace(/\t/g, "   ");

const resolveReadToolLanguageFromParents = (
	entry: SessionEntry,
	nodeById: Map<string, SessionTreeNode>,
): string | undefined => {
	if (getToolName(entry) !== "read") return undefined;

	const args = resolveToolCallFromParents(entry, nodeById)?.arguments;
	if (!args) return undefined;

	const rawPath = args["file_path"] ?? args["path"];
	if (typeof rawPath !== "string" || !rawPath.trim()) return undefined;
	return getLanguageFromPath(rawPath);
};

const renderPreviewBodyLines = (
	text: string,
	entry: SessionEntry,
	width: number,
	theme: any,
	nodeById: Map<string, SessionTreeNode>,
): string[] => {
	if (entry.type === "message") {
		const msg = entry.message as { role?: string; command?: string };

		// Bash execution nodes: highlight the command itself
		if (msg.role === "bashExecution" && typeof msg.command === "string") {
			return highlightCode(replaceTabs(text), "bash").map((line) => truncateToWidth(line, width));
		}

		// Read tool results: use parent toolCall args to infer language from path, matching pi's own renderer
		if (getToolName(entry) === "read") {
			const normalized = replaceTabs(text);
			const lang = resolveReadToolLanguageFromParents(entry, nodeById);

			const lines = lang
				? highlightCode(normalized, lang)
				: normalized.split("\n").map((line) => theme.fg("toolOutput", line));

			return lines.map((line) => truncateToWidth(line, width));
		}
	}

	// Everything else: render with pi's markdown renderer/theme (matches main UI)
	const markdown = new Markdown(text, 0, 0, getMarkdownTheme());
	return markdown.render(width);
};

const renderToolContextLines = (
	context: ToolContextPreview,
	width: number,
	theme: any,
): string[] => {
	const scalarRows = context.rows.filter((row) => row.kind === "scalar");
	const labelWidth = Math.max(4, ...scalarRows.map((row) => visibleWidth(row.label)));
	const scalarRow = (label: string, value: string): string => {
		const padding = " ".repeat(Math.max(2, labelWidth - visibleWidth(label) + 2));
		return truncateToWidth(
			`${theme.fg("text", label)}${padding}${theme.fg("muted", value)}`,
			width,
		);
	};
	const lines = [
		truncateToWidth(`${theme.fg("muted", "Tool")}  ${theme.fg("accent", context.tool)}`, width),
	];
	for (const argument of context.rows) {
		if (argument.kind === "scalar") {
			lines.push(scalarRow(argument.label, argument.value));
		} else if (argument.kind === "group") {
			lines.push(
				truncateToWidth(
					`${theme.fg("text", argument.label)}${theme.fg("muted", ` (${argument.value})`)}`,
					width,
				),
			);
		} else {
			lines.push(
				truncateToWidth(
					`  ${theme.fg("muted", argument.label)} ${theme.fg("muted", argument.value)}`,
					width,
				),
			);
		}
	}
	if (context.omitted) lines.push(theme.fg("dim", "… argument rows omitted"));
	lines.push(theme.fg("dim", "─".repeat(Math.max(1, width))));
	return lines;
};

const buildNodeMap = (roots: SessionTreeNode[]): Map<string, SessionTreeNode> => {
	const map = new Map<string, SessionTreeNode>();
	const stack = [...roots];
	while (stack.length > 0) {
		const node = stack.pop()!;
		map.set(node.entry.id, node);
		for (const child of node.children) stack.push(child);
	}
	return map;
};

const getTreeListInternals = (treeList: anycopyTreeList): anycopyTreeListInternals => {
	return treeList as unknown as anycopyTreeListInternals;
};

/** Clipboard text omits role prefix for a single node and includes it for multi-node copies
 * The preview pane is truncated for performance, while the clipboard copy is not
 */
const buildClipboardText = (
	nodes: SessionTreeNode[],
	nodeById: Map<string, SessionTreeNode>,
	includeToolCalls: boolean,
	debugToolEnvelopes: boolean,
): string => {
	const formatNode = (node: SessionTreeNode, includeRoleLabel: boolean): string => {
		const content = getEntryContent(node.entry);
		const toolPair = formatToolCallResultForClipboard(
			node.entry,
			nodeById,
			includeToolCalls,
			debugToolEnvelopes,
		);
		if (toolPair) return toolPair;
		if (!includeRoleLabel || node.entry.type === "custom") return content;
		return `${getEntryRoleLabel(node.entry)}:\n\n${content}`;
	};

	if (nodes.length === 1) return formatNode(nodes[0]!, false);

	return nodes.map((node) => formatNode(node, true)).join("\n\n---\n\n");
};

class anycopyOverlay implements Focusable {
	private selectedNodeIds = new Set<string>();
	private paneFocus: PaneFocus = "balanced";
	private rangeSelection: { anchorId: string; baselineIds: Set<string> } | null = null;
	private showEntryTimestamps = false;
	private flashMessage: string | null = null;
	private flashTimer: ReturnType<typeof setTimeout> | null = null;
	private _focused = false;
	private previewScrollOffset = 0;
	private lastPreviewHeight = 0;
	private previewCache: {
		entryId: string;
		width: number;
		bodyLines: string[];
		truncatedToMaxLines: boolean;
	} | null = null;

	constructor(
		private selector: TreeSelectorComponent,
		private getTree: () => SessionTreeNode[],
		private nodeById: Map<string, SessionTreeNode>,
		private keys: anycopyKeyConfig,
		private layoutEnabled: boolean,
		private layoutRatios: PaneLayoutRatios,
		private selection: SelectionRuntimeConfig,
		private toolCallCopyEnabled: boolean,
		private blockCopyEnabled: boolean,
		private clipboardCopyOptions: ClipboardCopyOptions,
		private showToolCallContext: boolean,
		private hintMode: HintMode,
		private navigationAvailable: boolean,
		private openHelp: (rows: KeyHelpRow[]) => void,
		private openBlockPicker: (nodeLabel: string, blocks: readonly StructuralBlock[]) => Promise<StructuralBlock[] | null>,
		private onExplicitFoldMutation: ((
			beforeTransientFoldedNodeIds: string[],
			afterTransientFoldedNodeIds: string[],
		) => void) | null,
		private getRenderHeight: () => number,
		private requestRender: () => void,
		private theme: any,
	) {}

	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.selector.focused = value;
	}

	private getTreeListInternals(): anycopyTreeListInternals {
		return getTreeListInternals(this.selector.getTreeList());
	}

	handleInput(data: string): void {
		if (this.isEditingNodeLabel()) {
			this.selector.handleInput(data);
			this.requestRender();
			return;
		}

		if (matchesKey(data, this.keys.help as MatchesKeyId)) {
			this.openHelp(this.getKeyHelpRows());
			return;
		}

		const isEnter = matchesKey(data, "enter" as MatchesKeyId);
		if (isEnter) {
			const enterAction = resolveEnterAction(
				this.selection.enterCopyMode,
				this.selectedNodeIds.size,
				this.navigationAvailable,
			);
			if (enterAction !== "navigate") {
				this.rangeSelection = null;
				this.copySelectedOrFocusedNode(
					"enter",
					this.selection.enterCopyMode === "output-with-tool-call",
					enterAction === "copy-focused",
				);
				return;
			}
		}

		if (this.layoutEnabled && matchesKey(data, this.keys.togglePaneFocus as MatchesKeyId)) {
			this.paneFocus = togglePaneFocus(this.paneFocus);
			this.lastPreviewHeight = 0;
			const layoutLabel =
				this.paneFocus === "balanced"
					? "Balanced layout"
					: this.paneFocus === "tree"
						? "Tree-focused layout"
						: "Preview-focused layout";
			this.flash(layoutLabel);
			return;
		}
		if (matchesKey(data, this.keys.toggleRangeSelection as MatchesKeyId)) {
			this.toggleRangeSelection();
			return;
		}
		if (matchesKey(data, this.keys.toggleSelect as MatchesKeyId)) {
			this.rangeSelection = null;
			this.toggleSelectedFocusedNode();
			return;
		}
		if (this.blockCopyEnabled && matchesKey(data, this.keys.copyBlock as MatchesKeyId)) {
			this.rangeSelection = null;
			void this.copyBlockFromFocusedNode();
			return;
		}
		if (
			this.toolCallCopyEnabled &&
			matchesKey(data, this.keys.copyWithToolCall as MatchesKeyId)
		) {
			this.rangeSelection = null;
			this.copySelectedOrFocusedNode("shortcut", true);
			return;
		}
		if (matchesKey(data, this.keys.copy as MatchesKeyId)) {
			this.rangeSelection = null;
			this.copySelectedOrFocusedNode("shortcut", false);
			return;
		}
		if (matchesKey(data, this.keys.clear as MatchesKeyId)) {
			this.rangeSelection = null;
			this.clearSelection();
			return;
		}
		if (matchesKey(data, this.keys.toggleToolCallContext as MatchesKeyId)) {
			this.showToolCallContext = !this.showToolCallContext;
			this.previewCache = null;
			this.previewScrollOffset = 0;
			this.flash(`Tool call context ${this.showToolCallContext ? "on" : "off"}`);
			return;
		}
		if (matchesKey(data, this.keys.toggleLabelTimestamps as MatchesKeyId)) {
			const treeList = this.getTreeListInternals();
			treeList.showLabelTimestamps = !treeList.showLabelTimestamps;
			this.requestRender();
			return;
		}
		if (matchesKey(data, this.keys.toggleEntryTimestamps as MatchesKeyId)) {
			this.showEntryTimestamps = !this.showEntryTimestamps;
			this.requestRender();
			return;
		}

		const keybindings = getKeybindings();
		if (keybindings.matches(data, "app.tree.toggleLabelTimestamp")) {
			return;
		}

		if (matchesKey(data, this.keys.scrollDown as MatchesKeyId)) {
			this.previewScrollOffset += 1;
			this.requestRender();
			return;
		}
		if (matchesKey(data, this.keys.scrollUp as MatchesKeyId)) {
			this.previewScrollOffset -= 1;
			this.requestRender();
			return;
		}
		if (matchesKey(data, this.keys.pageDown as MatchesKeyId)) {
			const step = getPreviewPageStep(this.lastPreviewHeight > 0 ? this.lastPreviewHeight : 10);
			this.previewScrollOffset += step;
			this.requestRender();
			return;
		}
		if (matchesKey(data, this.keys.pageUp as MatchesKeyId)) {
			const step = getPreviewPageStep(this.lastPreviewHeight > 0 ? this.lastPreviewHeight : 10);
			this.previewScrollOffset -= step;
			this.requestRender();
			return;
		}

		const beforeVisibleIds = this.getVisibleFilteredNodeIds();
		const beforeFocusedId = this.getFocusedNode()?.entry.id;
		const shouldTrackExplicitFoldMutation =
			this.onExplicitFoldMutation !== null &&
			(keybindings.matches(data, "app.tree.foldOrUp") || keybindings.matches(data, "app.tree.unfoldOrDown"));
		const beforeTransientFoldedNodeIds = shouldTrackExplicitFoldMutation ? getSelectorFoldedNodeIds(this.selector) : null;

		this.selector.handleInput(data);

		const afterVisibleIds = this.getVisibleFilteredNodeIds();
		const visibleRowsChanged =
			beforeVisibleIds.length !== afterVisibleIds.length ||
			beforeVisibleIds.some((id, index) => id !== afterVisibleIds[index]);
		if (visibleRowsChanged) {
			this.rangeSelection = null;
		} else if (this.rangeSelection) {
			const focusedId = this.getFocusedNode()?.entry.id;
			if (focusedId && focusedId !== beforeFocusedId) {
				this.selectedNodeIds = applyInclusiveRangeSelection(
					this.rangeSelection.baselineIds,
					afterVisibleIds,
					this.rangeSelection.anchorId,
					focusedId,
					this.selection.rangeMode,
				);
			}
		}

		if (beforeTransientFoldedNodeIds) {
			this.onExplicitFoldMutation?.(beforeTransientFoldedNodeIds, getSelectorFoldedNodeIds(this.selector));
		}

		this.requestRender();
	}

	private isEditingNodeLabel(): boolean {
		return Boolean((this.selector as unknown as { labelInput?: unknown }).labelInput);
	}

	invalidate(): void {
		// Preview is derived from focused entry + width; invalidate forces recompute
		this.previewCache = null;
		this.previewScrollOffset = 0;
		this.lastPreviewHeight = 0;
		this.selector.invalidate();
	}

	private getFocusedNode(): SessionTreeNode | undefined {
		return this.selector.getTreeList().getSelectedNode();
	}

	private getVisibleFilteredNodeIds(): string[] {
		return this.getTreeListInternals().filteredNodes
			.map(({ node }) => node.entry.id)
			.filter((id): id is string => typeof id === "string");
	}

	private toggleRangeSelection(): void {
		if (this.rangeSelection) {
			this.rangeSelection = null;
			this.flash(`Range selected (${this.selectedNodeIds.size} ${pluralizeNode(this.selectedNodeIds.size)})`);
			return;
		}

		const focused = this.getFocusedNode();
		if (!focused) return;
		const anchorId = focused.entry.id;
		const baselineIds = new Set(this.selectedNodeIds);
		this.rangeSelection = { anchorId, baselineIds };
		this.selectedNodeIds = applyInclusiveRangeSelection(
			baselineIds,
			this.getVisibleFilteredNodeIds(),
			anchorId,
			anchorId,
			this.selection.rangeMode,
		);
		this.flash(this.selection.rangeMode === "toggle"
			? "Range toggle active, move to extend"
			: "Range selection active, move to extend");
	}

	private flash(message: string): void {
		this.flashMessage = message;
		if (this.flashTimer) clearTimeout(this.flashTimer);
		this.flashTimer = setTimeout(() => {
			this.flashMessage = null;
			this.flashTimer = null;
			this.requestRender();
		}, FLASH_DURATION_MS);
		this.requestRender();
	}

	toggleSelectedFocusedNode(): void {
		const focused = this.getFocusedNode();
		if (!focused) return;
		const id = focused.entry.id;
		if (this.selectedNodeIds.has(id)) {
			this.selectedNodeIds.delete(id);
			this.flash("Unselected node");
		} else {
			this.selectedNodeIds.add(id);
			this.flash(`Selected (${this.selectedNodeIds.size} ${pluralizeNode(this.selectedNodeIds.size)})`);
		}
	}

	clearSelection(): void {
		if (this.selectedNodeIds.size === 0) {
			this.flash("Selection already empty");
			return;
		}
		this.selectedNodeIds.clear();
		this.flash("Cleared selection");
	}

	isSelectedNode(id: string): boolean {
		return this.selectedNodeIds.has(id);
	}

	shouldShowEntryTimestamps(): boolean {
		return this.showEntryTimestamps;
	}

	private async copyBlockFromFocusedNode(): Promise<void> {
		const focused = this.getFocusedNode();
		if (!focused) {
			this.flash("Nothing selected");
			return;
		}

		const result = await selectAndCopyStructuralBlocks(
			extractStructuralBlocks(getEntryContent(focused.entry)),
			(blocks) => this.openBlockPicker(getEntryRoleLabel(focused.entry), blocks),
		);
		if (result.type === "empty") {
			this.flash("No heading sections or structural blocks in this node");
			return;
		}
		if (result.type === "failed") {
			this.flash(`Copy failed: ${result.error}`);
			return;
		}
		if (result.type !== "copied") return;
		this.flash(
			result.selected.length === 1
				? `Copied ${result.selected[0]?.kind ?? "structural"} target to clipboard`
				: `Copied ${result.selected.length} targets to clipboard`,
		);
	}

	async copySelectedOrFocusedNode(
		trigger: CopyTrigger = "shortcut",
		includeToolCall = false,
		focusedOnly = false,
	): Promise<void> {
		const focused = this.getFocusedNode();
		const ids =
			!focusedOnly && this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: focused
					? [focused.entry.id]
					: [];

		if (ids.length === 0) {
			this.flash("Nothing selected");
			return;
		}

		const tree = this.getTree();
		const nodeById = buildNodeMap(tree);
		const nodeOrder = buildNodeOrder(tree);
		const nodes = ids
			.map((id) => nodeById.get(id))
			.filter((n): n is SessionTreeNode => Boolean(n))
			.sort((a, b) => {
				const oa = nodeOrder.get(a.entry.id) ?? Infinity;
				const ob = nodeOrder.get(b.entry.id) ?? Infinity;
				return oa - ob;
			});

		const result = await attemptClipboardCopy(
			buildClipboardText(nodes, nodeById, includeToolCall, this.selection.debugToolEnvelopes),
			copyToClipboard,
			this.clipboardCopyOptions,
		);
		if (!result.ok) {
			this.flash(`Copy failed: ${result.error}`);
			return;
		}
		if (shouldClearSelectionAfterCopy(this.selection.clearAfterCopy, trigger, nodes.length)) {
			this.selectedNodeIds.clear();
		}
		this.flash(`Copied ${nodes.length} ${pluralizeNode(nodes.length)} to clipboard`);
	}

	private getEnterLabel(): string {
		const action = resolveEnterAction(
			this.selection.enterCopyMode,
			this.selectedNodeIds.size,
			this.navigationAvailable,
		);
		if (action === "navigate") return "navigate";
		if (action === "copy-selection") {
			return this.selection.enterCopyMode === "output-with-tool-call" ? "copy selection + call" : "copy selection";
		}
		return this.selection.enterCopyMode === "output-with-tool-call" ? "copy focused + call" : "copy focused";
	}

	private getKeyHelpRows(dynamicEnter = true): KeyHelpRow[] {
		const rows: KeyHelpRow[] = [
			{
				keys: ["enter"],
				label: dynamicEnter ? this.getEnterLabel() : "navigate/copy by context",
				setting: "selection.enterCopyMode",
			},
			{
				keys: [this.keys.toggleRangeSelection],
				label: "toggle range selection",
				setting: "keys.toggleRangeSelection",
			},
			{
				keys: [this.keys.toggleSelect],
				label: "toggle focused node",
				setting: "keys.toggleSelect",
			},
			{
				keys: [this.keys.copy],
				label: "copy focused/selection",
				setting: "keys.copy",
			},
		];
		rows.push({
			keys: [this.keys.copyBlock],
			label: "copy block from focused node",
			setting: "keys.copyBlock",
			available: this.blockCopyEnabled,
			requires: "copy.enableBlockCopy",
		});
		rows.push({
			keys: [this.keys.copyWithToolCall],
			label: "copy with tool calls",
			setting: "keys.copyWithToolCall",
			available: this.toolCallCopyEnabled,
			requires: "copy.enableToolCallCopy",
		});
		rows.push({ keys: [this.keys.clear], label: "clear selection", setting: "keys.clear" });
		rows.push({
			keys: [this.keys.togglePaneFocus],
			label: "cycle pane layout",
			setting: "keys.togglePaneFocus",
			available: this.layoutEnabled,
			requires: "layout.enabled",
		});
		rows.push(
			{ keys: [this.keys.scrollUp], label: "scroll preview up", setting: "keys.scrollUp" },
			{ keys: [this.keys.scrollDown], label: "scroll preview down", setting: "keys.scrollDown" },
			{ keys: [this.keys.pageUp], label: "page preview up", setting: "keys.pageUp" },
			{ keys: [this.keys.pageDown], label: "page preview down", setting: "keys.pageDown" },
			{
				keys: [this.keys.toggleToolCallContext],
				label: "toggle tool call context",
				setting: "keys.toggleToolCallContext",
			},
			{
				keys: [this.keys.toggleLabelTimestamps],
				label: "toggle label time",
				setting: "keys.toggleLabelTimestamps",
			},
			{
				keys: [this.keys.toggleEntryTimestamps],
				label: "toggle entry time",
				setting: "keys.toggleEntryTimestamps",
			},
			{ keys: ["shift+l"], label: "edit label", setting: "native" },
			{ keys: [this.keys.help], label: dynamicEnter ? "close key help" : "show key help", setting: "keys.help" },
		);
		return rows;
	}

	private getStatusMessage(): string {
		if (this.flashMessage) return this.flashMessage;
		if (this.rangeSelection) {
			return `Range selection active · ${this.selectedNodeIds.size} selected ${pluralizeNode(this.selectedNodeIds.size)}`;
		}
		if (this.selectedNodeIds.size > 0) {
			return `${this.selectedNodeIds.size} selected ${pluralizeNode(this.selectedNodeIds.size)}`;
		}
		return this.hintMode === "compact"
			? `${formatCompactKey(this.keys.help)} help · Enter ${this.getEnterLabel()}`
			: "Ready";
	}

	private renderStatusBar(width: number): string[] {
		const statusRole = this.flashMessage ? "success" : this.selectedNodeIds.size > 0 ? "accent" : "dim";
		const hintSegments = this.getKeyHelpRows(false)
			.filter((row) => row.available !== false)
			.map((row) => `${row.keys.map(formatCompactKey).join("/")} ${row.label}`);
		return buildStatusTextLines(
			this.hintMode,
			this.getStatusMessage(),
			hintSegments,
			Math.max(1, width - 2),
			visibleWidth,
		).map((line, index) =>
			truncateToWidth(this.theme.fg(index === 0 ? statusRole : "dim", `  ${line}`), width),
		);
	}

	private renderPreviewDivider(width: number, message?: string): string {
		const label = message ? ` ${message} ` : "";
		const ruleWidth = Math.max(0, width - visibleWidth(label) - 1);
		return truncateToWidth(this.theme.fg("dim", `─${label}${"─".repeat(ruleWidth)}`), width);
	}

	private getPreviewBody(width: number): { bodyLines: string[]; truncatedToMaxLines: boolean } | null {
		const focused = this.getFocusedNode();
		if (!focused) return null;

		const entryId = focused.entry.id;
		if (this.previewCache && this.previewCache.entryId === entryId && this.previewCache.width === width) {
			return this.previewCache;
		}

		const content = getPreviewEntryContent(focused.entry);
		const clipped = clipTextForPreview(content);
		const resultLines = renderPreviewBodyLines(
			clipped,
			focused.entry,
			width,
			this.theme,
			this.nodeById,
		);
		const toolContext = this.showToolCallContext
			? buildToolContextPreview(resolveToolCallFromParents(focused.entry, this.nodeById))
			: null;
		const rendered = toolContext
			? [...renderToolContextLines(toolContext, width, this.theme), ...resultLines]
			: resultLines;
		const preview = {
			entryId,
			width,
			bodyLines: rendered.slice(0, MAX_PREVIEW_LINES),
			truncatedToMaxLines: rendered.length > MAX_PREVIEW_LINES,
		};

		this.previewCache = preview;
		this.previewScrollOffset = 0;
		return preview;
	}

	private renderPreview(width: number, height: number): string[] {
		if (height <= 0) return [];

		this.lastPreviewHeight = height;

		const preview = this.getPreviewBody(width);
		const lines: string[] = [];
		if (!preview) {
			lines.push(truncateToWidth(this.theme.fg("dim", "  (no node selected)"), width));
			while (lines.length < height) lines.push("");
			return lines;
		}

		const bodyLines = [...preview.bodyLines];
		if (preview.truncatedToMaxLines) {
			bodyLines.push(
				truncateToWidth(this.theme.fg("muted", `… [truncated to ${MAX_PREVIEW_LINES} lines]`), width),
			);
		}

		const window = getPreviewWindow(bodyLines.length, height, this.previewScrollOffset);
		this.previewScrollOffset = window.start;

		if (height === 1) {
			const hidden = Math.max(window.above, window.below);
			return [this.renderPreviewDivider(width, hidden > 0 ? `… ${hidden} line(s)` : undefined)];
		}

		lines.push(
			this.renderPreviewDivider(
				width,
				window.above > 0 ? `… ${window.above} line(s) above` : undefined,
			),
		);
		lines.push(...bodyLines.slice(window.start, window.end));
		lines.push(
			this.renderPreviewDivider(
				width,
				window.below > 0 ? `… ${window.below} line(s) below` : undefined,
			),
		);

		while (lines.length < height) lines.splice(lines.length - 1, 0, "");
		if (lines.length > height) lines.length = height;
		return lines;
	}

	private renderSelector(width: number, visibleRows: number): string[] {
		this.getTreeListInternals().maxVisibleLines = Math.max(1, visibleRows);
		const selectorLines = this.selector.render(width);

		// Remove the selector's spacer after the search prompt and before its bottom border.
		const searchLineIndex = selectorLines.findIndex((line) => line.includes("Type to search"));
		const listStartIndex = searchLineIndex >= 0 ? searchLineIndex + 2 : -1;
		if (listStartIndex >= 0 && visibleWidth(selectorLines[listStartIndex] ?? "") === 0) {
			selectorLines.splice(listStartIndex, 1);
		}
		while (selectorLines.length > 1 && visibleWidth(selectorLines.at(-2) ?? "") === 0) {
			selectorLines.splice(selectorLines.length - 2, 1);
		}
		while (selectorLines.length > 0 && visibleWidth(selectorLines.at(-1) ?? "") === 0) {
			selectorLines.pop();
		}
		return selectorLines;
	}

	render(width: number): string[] {
		const height = this.getRenderHeight();
		const output: string[] = [];
		const statusLines = this.renderStatusBar(width);
		const probeLines = this.renderSelector(width, TREE_SELECTOR_PROBE_ROWS);
		const selectorChromeRows = Math.max(0, probeLines.length - TREE_SELECTOR_PROBE_ROWS);
		const availablePaneRows = Math.max(1, height - selectorChromeRows - statusLines.length);
		const treeVisibleRows = getAnycopyTreeVisibleLines(availablePaneRows, this.paneFocus, this.layoutRatios);
		const selectorLines =
			treeVisibleRows === TREE_SELECTOR_PROBE_ROWS ? probeLines : this.renderSelector(width, treeVisibleRows);

		output.push(...selectorLines);
		output.push(...statusLines);

		const previewHeight = Math.max(0, height - output.length);
		if (previewHeight > 0) {
			output.push(...this.renderPreview(width, previewHeight));
		}

		while (output.length < height) output.push("");
		if (output.length > height) output.length = height;
		return output;
	}

	dispose(): void {
		if (this.flashTimer) {
			clearTimeout(this.flashTimer);
			this.flashTimer = null;
		}
		this.previewCache = null;
		this.previewScrollOffset = 0;
		this.lastPreviewHeight = 0;
		this.nodeById.clear();
	}
}

const canNavigateTree = (ctx: ExtensionContext): ctx is ExtensionCommandContext =>
	typeof (ctx as { navigateTree?: unknown }).navigateTree === "function";

export default function anycopyExtension(pi: ExtensionAPI) {
	const config = loadConfig();
	const keys = config.keys;
	const shortcut = config.shortcut;
	const layoutEnabled = config.layoutEnabled;
	const layoutRatios = config.layoutRatios;
	const selection = config.selection;
	const toolCallCopyEnabled = config.toolCallCopyEnabled;
	const blockCopyEnabled = config.blockCopyEnabled;
	const clipboardCopyOptions = config.clipboardCopyOptions;
	const blockPickerAutoClose = config.blockPickerAutoClose;
	const initialToolCallContext = config.initialToolCallContext;
	const hintMode = config.hintMode;
	const treeFilterMode = config.treeFilterMode;
	const persistFoldState = config.persistFoldState;

	const openAnycopy = async (ctx: ExtensionContext, opts?: { initialSelectedId?: string }) => {
		if (!ctx.hasUI) return;

		const initialTree = ctx.sessionManager.getTree() as SessionTreeNode[];
		if (initialTree.length === 0) {
			ctx.ui.notify("No entries in session", "warning");
			return;
		}

		const getTree = () => ctx.sessionManager.getTree() as SessionTreeNode[];
		const currentLeafId = ctx.sessionManager.getLeafId();
		const skipSummaryPrompt = loadBranchSummarySkipPrompt(ctx.cwd);
		let overlayHandle: { focus(): void; unfocus(): void } | undefined;

		await ctx.ui.custom<void>((tui, theme, _kb, done) => {
			let closed = false;
			const closeOverlay = (): void => {
				if (closed) return;
				closed = true;
				overlayHandle?.unfocus();
				done();
			};
			const getRenderHeight = (): number => getAnycopyRenderHeight(tui.terminal?.rows ?? 40);
			const openBlockPicker = async (
				nodeLabel: string,
				blocks: readonly StructuralBlock[],
			): Promise<StructuralBlock[] | null> => {
				try {
					return await pickStructuralBlocks(
						ctx,
						nodeLabel,
						blocks,
						keys,
						blockPickerAutoClose,
					);
				} finally {
					overlayHandle?.focus();
					tui.requestRender();
				}
			};
			const openKeyHelp = (rows: KeyHelpRow[]): void => {
				const terminalWidth = tui.terminal?.columns ?? 120;
				const preferredWidth = getKeyHelpPreferredWidth(rows, true, true, visibleWidth);
				const helpWidth = Math.min(preferredWidth, Math.max(20, terminalWidth - 4));
				void ctx.ui
					.custom<void>(
						(helpTui, helpTheme, _helpKb, closeHelp) => {
							const helpComponent = new AnycopyKeyHelp(
								helpTheme,
								rows,
								keys.help,
								keys.helpToggleSettings,
								keys.helpToggleUnavailable,
								() => helpTui.requestRender(),
								closeHelp,
							);
							return helpComponent;
						},
						{
							overlay: true,
							overlayOptions: {
								anchor: "center",
								width: helpWidth,
								minWidth: Math.min(40, helpWidth),
								maxHeight: "80%",
								margin: 1,
							},
							onHandle: (handle) => handle.focus(),
						},
					)
					.catch((error: unknown) => {
						ctx.ui.notify(error instanceof Error ? error.message : "Failed to open anycopy key help", "error");
					})
					.finally(() => tui.requestRender());
			};
			const treeTermHeight = getAnycopyTreeHeight(getRenderHeight());
			const nodeById = buildNodeMap(initialTree);
			const validNodeIds = new Set(nodeById.keys());
			const restoredFoldState = persistFoldState
				? loadLatestFoldStateFromEntries(ctx.sessionManager.getEntries() as SessionEntry[], validNodeIds)
				: null;
			let durableFoldedNodeIds = restoredFoldState?.foldedNodeIds ?? [];
			let lastPersistedFoldedNodeIds = durableFoldedNodeIds;
			const currentLeafIdForNoop = currentLeafId;
			const navigateTree = canNavigateTree(ctx) ? ctx.navigateTree.bind(ctx) : null;

			const startEnterNavigation = navigateTree
				? createAnycopyEnterNavigationLauncher(async (entryId) =>
						runAnycopyEnterNavigation({
							entryId,
							currentLeafIdForNoop,
							skipSummaryPrompt,
							close: closeOverlay,
							reopen: (reopenOpts) => {
								void openAnycopy(ctx, reopenOpts);
							},
							navigateTree: async (targetId, options) => navigateTree(targetId, options),
							ui: {
								select: async (title, options) =>
									(await ctx.ui.select(title, options)) as (typeof options)[number] | undefined,
								editor: (title) => ctx.ui.editor(title),
								setStatus: (source, message) => ctx.ui.setStatus(source, message),
								setWorkingMessage: (message) => ctx.ui.setWorkingMessage(message),
								notify: (message, level) => ctx.ui.notify(message, level),
							},
						}),
					)
				: () => ctx.ui.notify("Navigation requires opening /anycopy as a command", "warning");

			const selector = new TreeSelectorComponent(
				initialTree,
				currentLeafId,
				treeTermHeight,
				startEnterNavigation,
				closeOverlay,
				(entryId, label) => {
					pi.setLabel(entryId, label);
				},
				opts?.initialSelectedId,
				treeFilterMode,
			);

			if (persistFoldState) {
				const restoredFoldedNodeIds = normalizeFoldedNodeIds(
					setSelectorFoldedNodeIds(selector, durableFoldedNodeIds),
					validNodeIds,
				);
				durableFoldedNodeIds = restoredFoldedNodeIds;
				lastPersistedFoldedNodeIds = restoredFoldedNodeIds;
			}

			const persistDurableFoldState = (nextDurableFoldedNodeIds: string[]): void => {
				if (!persistFoldState || foldStateNodeIdListsEqual(nextDurableFoldedNodeIds, lastPersistedFoldedNodeIds)) {
					return;
				}

				try {
					pi.appendEntry(
						ANYCOPY_FOLD_STATE_CUSTOM_TYPE,
						createFoldStateEntryData(nextDurableFoldedNodeIds, validNodeIds),
					);
					lastPersistedFoldedNodeIds = nextDurableFoldedNodeIds;
				} catch (error) {
					ctx.ui.notify(
						error instanceof Error ? error.message : "Failed to persist /anycopy fold state",
						"error",
					);
				}
			};

			const handleExplicitFoldMutation = (
				beforeTransientFoldedNodeIds: string[],
				afterTransientFoldedNodeIds: string[],
			): void => {
				const nextDurableFoldedNodeIds = mergeExplicitFoldMutation({
					durableFoldedNodeIds,
					beforeTransientFoldedNodeIds,
					afterTransientFoldedNodeIds,
					validNodeIds,
				});
				if (foldStateNodeIdListsEqual(nextDurableFoldedNodeIds, durableFoldedNodeIds)) {
					return;
				}

				durableFoldedNodeIds = nextDurableFoldedNodeIds;
				persistDurableFoldState(nextDurableFoldedNodeIds);
			};

			const overlay = new anycopyOverlay(
				selector,
				getTree,
				nodeById,
				keys,
				layoutEnabled,
				layoutRatios,
				selection,
				toolCallCopyEnabled,
				blockCopyEnabled,
				clipboardCopyOptions,
				initialToolCallContext,
				hintMode,
				navigateTree !== null,
				openKeyHelp,
				openBlockPicker,
				persistFoldState ? handleExplicitFoldMutation : null,
				getRenderHeight,
				() => tui.requestRender(),
				theme,
			);

			const treeList = selector.getTreeList();
			const treeListInternals = getTreeListInternals(treeList);
			const originalRender = treeList.render.bind(treeList);
			treeList.render = (width: number) => {
				const innerWidth = Math.max(10, width - 2);
				const lines = originalRender(innerWidth);
				const filtered = treeListInternals.filteredNodes;

				if (!Array.isArray(filtered) || filtered.length === 0) {
					return lines.map((line: string) => truncateToWidth(`  ${line}`, width));
				}

				const maxVisible = Math.max(1, treeListInternals.maxVisibleLines);
				const startIdx = Math.max(
					0,
					Math.min(treeListInternals.selectedIndex - Math.floor(maxVisible / 2), filtered.length - maxVisible),
				);
				const treeRowCount = Math.max(0, lines.length - 1);
				const nowMs = Date.now();
				const appendEntryTimestamp = (lineWithMarker: string, entry: SessionEntry): string => {
					if (!overlay.shouldShowEntryTimestamps()) return truncateToWidth(lineWithMarker, width);

					const timestampMs = getEntryTimestampMs(entry);
					if (timestampMs === null) return truncateToWidth(lineWithMarker, width);

					const timestamp = formatCompactTimestamp(timestampMs, nowMs);
					const timestampWidth = visibleWidth(timestamp);
					const contentWidth = Math.max(0, width - timestampWidth - 1);
					const truncatedContent = truncateToWidth(lineWithMarker, contentWidth);
					const padding = Math.max(1, width - visibleWidth(truncatedContent) - timestampWidth);

					return truncateToWidth(
						truncatedContent + " ".repeat(padding) + theme.fg("muted", timestamp),
						width,
					);
				};

				return lines.map((line: string, i: number) => {
					if (i >= treeRowCount) return truncateToWidth(`  ${line}`, width);

					const entry = filtered[startIdx + i]?.node.entry;
					if (typeof entry?.id !== "string") return truncateToWidth(`  ${line}`, width);

					const marker = overlay.isSelectedNode(entry.id)
						? theme.fg("success", "✓ ")
						: theme.fg("dim", "○ ");
					return appendEntryTimestamp(marker + line, entry);
				});
			};

			return overlay;
		}, {
			overlay: true,
			overlayOptions: {
				anchor: "top-left",
				width: "100%",
				maxHeight: "100%",
				margin: 0,
			},
			onHandle: (handle) => {
				overlayHandle = handle;
				handle.focus();
			},
		});
	};

	const openLatestAssistantStructuralCopy = async (ctx: ExtensionContext): Promise<void> => {
		if (ctx.mode !== "tui") return;

		const text = getLastAssistantText(ctx.sessionManager.getBranch());
		if (!text) {
			ctx.ui.notify("No assistant response to copy", "warning");
			return;
		}

		const result = await selectAndCopyStructuralBlocks(
			addWholeMessageStructuralTarget(text, extractStructuralBlocks(text)),
			(blocks) => pickStructuralBlocks(ctx, "latest assistant response", blocks, keys, blockPickerAutoClose),
			clipboardCopyOptions,
		);
		if (result.type === "empty") {
			ctx.ui.notify("No heading sections or structural blocks in the latest assistant response", "warning");
			return;
		}
		if (result.type === "failed") {
			ctx.ui.notify(`Copy failed: ${result.error}`, "error");
			return;
		}
		if (result.type !== "copied") return;

		ctx.ui.notify(
			result.selected.length === 1
				? `Copied ${result.selected[0]?.kind ?? "structural"} target to clipboard`
				: `Copied ${result.selected.length} targets to clipboard`,
			"info",
		);
	};

	pi.registerCommand("anycopy", {
		description: "Browse session tree with preview and copy any node(s) to clipboard",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			await openAnycopy(ctx);
		},
	});

	const blockCopyShortcut = resolveLatestAssistantCopyShortcut(blockCopyEnabled, keys.copyBlock);
	if (blockCopyShortcut) {
		pi.registerShortcut(blockCopyShortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
			description: "Copy a section or structural block from the latest assistant response",
			handler: openLatestAssistantStructuralCopy,
		});
	}

	if (shortcut) {
		pi.registerShortcut(shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
			description: "Open /anycopy",
			handler: async (ctx: ExtensionContext) => {
				if (!ctx.hasUI) return;
				await openAnycopy(ctx);
			},
		});
	}
}
