import {
	getAgentDir,
	getMarkdownTheme,
	highlightCode,
	keyText,
	SettingsManager,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Markdown,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";

import {
	editStructuralBlockInExternalEditor,
} from "./external-editor.ts";
import { createTableJunction, formatCompactKey } from "./key-help-data.ts";
import { getPreviewPageStep } from "./preview-window.ts";
import {
	STRUCTURAL_COPY_OVERLAY_MAX_HEIGHT,
	STRUCTURAL_COPY_OVERLAY_WIDTH_RATIO,
	formatStructuralCopyLineCount,
	getStructuralCopyLayout,
	getStructuralCopyPreviewWindow,
	getStructuralCopySplitBodyHeight,
	getStructuralCopyStackedPaneHeights,
	getStructuralCopyViewportHeight,
	isStructuralCopyPreviewActionAvailable,
	toggleStructuralCopyPaneFocus,
	type StructuralCopyLayout,
	type StructuralCopyPaneFocus,
} from "./structural-copy-layout.ts";
import {
	buildStructuralBlockSelectItems,
	getStructuralBlockKindLabel,
	getStructuralBlockPreviewLanguage,
	getVisibleStructuralBlockItems,
	resolveStructuralBlockSelectionIndexes,
	shouldAutoCloseStructuralBlockPicker,
	toggleStructuralBlockMark,
	type StructuralBlock,
	type StructuralBlockPickerAutoClose,
} from "./structural-copy.ts";

type PickerRow = {
	sourceIndex: number;
	block: StructuralBlock;
	label: string;
	description: string;
	searchText: string;
	depth: number;
	targetId?: string;
	parentTargetId?: string;
	isExpandable: boolean;
};

type RenderedPreview = {
	lines: string[];
	above: number;
	below: number;
};

export type StructuralCopyPickerKeys = {
	toggleSelect: string;
	togglePaneFocus: string;
	scrollUp: string;
	scrollDown: string;
	pageUp: string;
	pageDown: string;
};

type MatchesKeyId = Parameters<typeof matchesKey>[1];
type ExternalEditorMatcher = (data: string) => boolean;

export type StructuralCopyPickerState = {
	selectedSourceIndex: number;
	filter: string;
	paneFocus: StructuralCopyPaneFocus;
	previewScrollOffset: number;
	markedSourceIndexes: number[];
	expandedTargetIds: string[];
};

export type StructuralCopyPickerOutcome =
	| { type: "cancel"; state: StructuralCopyPickerState }
	| { type: "select"; blocks: StructuralBlock[]; state: StructuralCopyPickerState }
	| { type: "edit"; sourceIndex: number; state: StructuralCopyPickerState };

const isPrintableInput = (data: string): boolean =>
	data.length > 0 &&
	[...data].every((character) => {
		const code = character.charCodeAt(0);
		return code >= 32 && code !== 127;
	});

const createPickerRows = (blocks: readonly StructuralBlock[]): PickerRow[] =>
	buildStructuralBlockSelectItems(blocks).map((item) => ({
		sourceIndex: item.targetIndex,
		block: blocks[item.targetIndex] as StructuralBlock,
		label: item.label.replace(/^\[[^\]]+\]\s*/, ""),
		description: item.description,
		searchText: item.searchText,
		depth: item.depth,
		targetId: item.targetId,
		parentTargetId: item.parentTargetId,
		isExpandable: item.isExpandable,
	}));

export class AnycopyBlockPicker implements Component {
	private readonly rows: PickerRow[];
	private filteredRows: PickerRow[];
	private selectedIndex = 0;
	private filter: string;
	private paneFocus: StructuralCopyPaneFocus;
	private readonly markedSourceIndexes: Set<number>;
	private readonly expandedTargetIds: Set<string>;
	private layoutMode: StructuralCopyLayout["mode"] = "compact";
	private previewScrollOffset: number;
	private lastPreviewHeight = 0;
	private closed = false;
	private previewCache: {
		block: StructuralBlock;
		width: number;
		lines: string[];
	} | null = null;

	constructor(
		private readonly theme: Theme,
		private readonly nodeLabel: string,
		blocks: readonly StructuralBlock[],
		private readonly keys: StructuralCopyPickerKeys,
		private readonly getViewportHeight: () => number,
		private readonly requestRender: () => void,
		private readonly done: (value: StructuralCopyPickerOutcome) => void,
		private readonly matchesExternalEditor: ExternalEditorMatcher,
		private readonly externalEditorKey: string,
		private readonly autoClose: StructuralBlockPickerAutoClose,
		initialState: StructuralCopyPickerState,
	) {
		this.rows = createPickerRows(blocks);
		this.filter = initialState.filter;
		this.paneFocus = initialState.paneFocus;
		this.previewScrollOffset = initialState.previewScrollOffset;
		this.markedSourceIndexes = new Set(initialState.markedSourceIndexes);
		this.expandedTargetIds = new Set(initialState.expandedTargetIds);
		this.filteredRows = this.filterRows();
		const restoredIndex = this.filteredRows.findIndex(
			(row) => row.sourceIndex === initialState.selectedSourceIndex,
		);
		this.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
	}

	handleInput(data: string): void {
		if (this.closed) return;

		if (
			isStructuralCopyPreviewActionAvailable(this.layoutMode, this.paneFocus) &&
			this.matchesExternalEditor(data)
		) {
			this.openSelectedBlockInExternalEditor();
			return;
		}
		if (matchesKey(data, this.keys.toggleSelect as MatchesKeyId)) {
			this.toggleSelectedBlock();
			return;
		}
		if (
			this.layoutMode === "split" &&
			matchesKey(data, this.keys.togglePaneFocus as MatchesKeyId)
		) {
			this.paneFocus = toggleStructuralCopyPaneFocus(this.paneFocus);
			this.requestRender();
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
			this.previewScrollOffset += getPreviewPageStep(Math.max(1, this.lastPreviewHeight));
			this.requestRender();
			return;
		}
		if (matchesKey(data, this.keys.pageUp as MatchesKeyId)) {
			this.previewScrollOffset -= getPreviewPageStep(Math.max(1, this.lastPreviewHeight));
			this.requestRender();
			return;
		}
		if (matchesKey(data, "left")) {
			this.collapseOrSelectParentTarget();
			return;
		}
		if (matchesKey(data, "right")) {
			this.expandOrSelectFirstChild();
			return;
		}
		if (matchesKey(data, "up")) {
			this.moveSelection(-1);
			return;
		}
		if (matchesKey(data, "down")) {
			this.moveSelection(1);
			return;
		}
		if (matchesKey(data, "home")) {
			this.selectedIndex = 0;
			this.resetPreview();
			this.requestRender();
			return;
		}
		if (matchesKey(data, "end")) {
			this.selectedIndex = Math.max(0, this.filteredRows.length - 1);
			this.resetPreview();
			this.requestRender();
			return;
		}
		if (matchesKey(data, "enter")) {
			this.finishSelection();
			return;
		}
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.finish({ type: "cancel", state: this.getState() });
			return;
		}
		if (matchesKey(data, "backspace") || matchesKey(data, "ctrl+h")) {
			if (this.filter) {
				this.filter = this.filter.slice(0, -1);
				this.applyFilter();
			}
			return;
		}
		if (matchesKey(data, "ctrl+u")) {
			if (this.filter) {
				this.filter = "";
				this.applyFilter();
			}
			return;
		}
		if (isPrintableInput(data)) {
			this.filter += data;
			this.applyFilter();
		}
	}

	private openSelectedBlockInExternalEditor(): void {
		const row = this.filteredRows[this.selectedIndex];
		if (!row || row.isExpandable || row.block.kind === "message" || row.block.kind === "json") return;
		this.finish({ type: "edit", sourceIndex: row.sourceIndex, state: this.getState() });
	}

	private getState(): StructuralCopyPickerState {
		return {
			selectedSourceIndex: this.filteredRows[this.selectedIndex]?.sourceIndex ?? 0,
			filter: this.filter,
			paneFocus: this.paneFocus,
			previewScrollOffset: this.previewScrollOffset,
			markedSourceIndexes: [...this.markedSourceIndexes].sort((left, right) => left - right),
			expandedTargetIds: [...this.expandedTargetIds].sort(),
		};
	}

	private finishSelection(): void {
		const focusedSourceIndex = this.filteredRows[this.selectedIndex]?.sourceIndex;
		const selectedIndexes = resolveStructuralBlockSelectionIndexes(
			this.markedSourceIndexes,
			focusedSourceIndex,
			this.rows.map((row) => row.block),
		);
		if (selectedIndexes.length === 0) return;
		this.finish({
			type: "select",
			blocks: selectedIndexes
				.map((sourceIndex) => this.rows[sourceIndex]?.block)
				.filter((block): block is StructuralBlock => block !== undefined),
			state: this.getState(),
		});
	}

	private toggleSelectedBlock(): void {
		const row = this.filteredRows[this.selectedIndex];
		if (!row) return;
		const isMarked = toggleStructuralBlockMark(this.markedSourceIndexes, row.sourceIndex);
		if (isMarked && shouldAutoCloseStructuralBlockPicker(this.autoClose, this.rows.length)) {
			this.finishSelection();
			return;
		}
		this.requestRender();
	}

	private collapseOrSelectParentTarget(): void {
		const row = this.filteredRows[this.selectedIndex];
		if (!row) return;
		if (row.targetId && this.expandedTargetIds.delete(row.targetId)) {
			this.applyFilter(row.sourceIndex);
			return;
		}
		if (!row.parentTargetId) return;
		const parentIndex = this.filteredRows.findIndex(
			(candidate) => candidate.targetId === row.parentTargetId,
		);
		if (parentIndex < 0) return;
		this.selectedIndex = parentIndex;
		this.resetPreview();
		this.requestRender();
	}

	private expandOrSelectFirstChild(): void {
		const row = this.filteredRows[this.selectedIndex];
		if (!row?.targetId || !row.isExpandable) return;
		if (!this.expandedTargetIds.has(row.targetId)) {
			this.expandedTargetIds.add(row.targetId);
			this.applyFilter(row.sourceIndex);
			return;
		}
		const childIndex = this.filteredRows.findIndex(
			(candidate) => candidate.parentTargetId === row.targetId,
		);
		if (childIndex < 0) return;
		this.selectedIndex = childIndex;
		this.resetPreview();
		this.requestRender();
	}


	private finish(value: StructuralCopyPickerOutcome): void {
		if (this.closed) return;
		this.closed = true;
		this.done(value);
	}

	private resetPreview(): void {
		this.previewScrollOffset = 0;
		this.lastPreviewHeight = 0;
		this.previewCache = null;
	}

	private moveSelection(delta: number): void {
		if (this.filteredRows.length === 0) return;
		this.selectedIndex =
			(this.selectedIndex + delta + this.filteredRows.length) % this.filteredRows.length;
		this.resetPreview();
		this.requestRender();
	}

	private applyFilter(preferredSourceIndex?: number): void {
		const selectedSourceIndex =
			preferredSourceIndex ?? this.filteredRows[this.selectedIndex]?.sourceIndex;
		this.filteredRows = this.filterRows();
		const restoredIndex = this.filteredRows.findIndex(
			(row) => row.sourceIndex === selectedSourceIndex,
		);
		this.selectedIndex = restoredIndex >= 0
			? restoredIndex
			: this.filteredRows.length
				? Math.min(this.selectedIndex, this.filteredRows.length - 1)
				: 0;
		this.resetPreview();
		this.requestRender();
	}

	private filterRows(): PickerRow[] {
		const visibleItems = getVisibleStructuralBlockItems(
			this.rows.map((row) => ({
				value: `${row.sourceIndex}\t${row.searchText}`,
				label: row.label,
				description: row.description,
				targetIndex: row.sourceIndex,
				depth: row.depth,
				targetId: row.targetId,
				parentTargetId: row.parentTargetId,
				isExpandable: row.isExpandable,
				searchText: row.searchText,
			})),
			this.expandedTargetIds,
			this.filter,
		);
		const visibleIndexes = new Set(visibleItems.map((item) => item.targetIndex));
		return this.rows.filter((row) => visibleIndexes.has(row.sourceIndex));
	}

	private truncate(text: string, width: number): string {
		return truncateToWidth(text, width, this.theme.fg("dim", "..."));
	}

	private fitCell(text: string, width: number): string {
		const clipped = this.truncate(text, Math.max(0, width));
		return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
	}

	private border(text: string): string {
		return this.theme.fg("dim", text);
	}

	private formatRowLabel(row: PickerRow): string {
		const indent = "  ".repeat(row.depth);
		const disclosure = row.isExpandable
			? this.expandedTargetIds.has(row.targetId ?? "") || this.filter.trim()
				? "▾ "
				: "▸ "
			: "  ";
		return `${indent}${disclosure}${row.label} · ${row.description}`;
	}

	private fullLine(content: string, contentWidth: number, centered = false): string {
		const clipped = this.truncate(content, contentWidth);
		const padding = Math.max(0, contentWidth - visibleWidth(clipped));
		const leftPadding = centered ? Math.floor(padding / 2) : 0;
		return `${this.border("│")} ${" ".repeat(leftPadding)}${clipped}${" ".repeat(padding - leftPadding)} ${this.border("│")}`;
	}

	private getVisibleRows(maxVisible: number): Array<{ row: PickerRow; selected: boolean }> {
		if (this.filteredRows.length === 0 || maxVisible <= 0) return [];
		const visibleCount = Math.min(maxVisible, this.filteredRows.length);
		const start = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(visibleCount / 2),
				this.filteredRows.length - visibleCount,
			),
		);
		return this.filteredRows.slice(start, start + visibleCount).map((row, offset) => ({
			row,
			selected: start + offset === this.selectedIndex,
		}));
	}

	private renderTableRows(typeWidth: number, blockWidth: number, height: number): string[] {
		const visibleRows = this.getVisibleRows(height);
		const lines = visibleRows.map(({ row, selected }) => {
			const marker = `${selected ? "→" : " "}${this.markedSourceIndexes.has(row.sourceIndex) ? "*" : " "} `;
			const type = `${marker}${getStructuralBlockKindLabel(row.block.kind)}`;
			const action = this.formatRowLabel(row);
			return `${this.border("│")} ${this.theme.fg(selected ? "accent" : "dim", this.fitCell(type, typeWidth))} ${this.border("│")} ${this.theme.fg(
				selected ? "text" : "muted",
				this.fitCell(action, blockWidth),
			)} ${this.border("│")}`;
		});
		if (lines.length === 0) {
			lines.push(
				`${this.border("│")} ${this.theme.fg("warning", this.fitCell(`No blocks match “${this.filter}”`, typeWidth + blockWidth + 3))} ${this.border("│")}`,
			);
		}
		while (lines.length < height) {
			lines.push(`${this.border("│")} ${this.fitCell("", typeWidth)} ${this.border("│")} ${this.fitCell("", blockWidth)} ${this.border("│")}`);
		}
		return lines.slice(0, height);
	}

	private getPreviewBodyLines(block: StructuralBlock, width: number): string[] {
		if (
			this.previewCache &&
			this.previewCache.block === block &&
			this.previewCache.width === width
		) {
			return this.previewCache.lines;
		}
		const source = block.content.replace(/\t/g, "   ");
		const previewLanguage = getStructuralBlockPreviewLanguage(block);
		const rendered =
			previewLanguage
				? highlightCode(source, previewLanguage)
				: new Markdown(source, 0, 0, getMarkdownTheme()).render(width);
		const lines = (rendered.length > 0 ? rendered : [this.theme.fg("dim", "(empty)")]).map(
			(line) => this.truncate(line, width),
		);
		this.previewCache = { block, width, lines };
		return lines;
	}

	private renderBorderIndicator(
		border: string,
		hiddenLines: number,
		direction: "above" | "below",
	): string {
		if (hiddenLines <= 0 || border.length < 4) return this.border(border);
		const end = border.slice(-1);
		const bodyCharacters = [...border.slice(0, -1)];
		const fullLabel = `… ${hiddenLines} line(s) ${direction}`;
		const maxLabelWidth = Math.max(1, bodyCharacters.length - 3);
		const label = this.truncate(fullLabel, maxLabelWidth);
		const prefixLength = Math.max(0, bodyCharacters.length - visibleWidth(label) - 3);
		const prefix = bodyCharacters.slice(0, prefixLength).join("");
		return `${this.border(prefix)} ${this.theme.fg("muted", label)} ${this.border(`─${end}`)}`;
	}

	private renderPreviewViewport(
		block: StructuralBlock | undefined,
		width: number,
		height: number,
	): RenderedPreview {
		if (height <= 0) return { lines: [], above: 0, below: 0 };
		this.lastPreviewHeight = height;
		if (!block) {
			const lines = [this.fitCell(this.theme.fg("dim", "No matching block"), width)];
			while (lines.length < height) lines.push(this.fitCell("", width));
			return { lines, above: 0, below: 0 };
		}

		const bodyLines = this.getPreviewBodyLines(block, width);
		const window = getStructuralCopyPreviewWindow(
			bodyLines.length,
			height,
			this.previewScrollOffset,
		);
		this.previewScrollOffset = window.start;
		const lines = bodyLines
			.slice(window.start, window.end)
			.map((line) => this.fitCell(line, width));
		while (lines.length < height) lines.push(this.fitCell("", width));
		return { lines: lines.slice(0, height), above: window.above, below: window.below };
	}

	private renderHeader(contentWidth: number, selected?: PickerRow): string {
		const left = this.theme.fg("accent", `Copy section or block from ${this.nodeLabel}`);
		const sourceLines = selected?.block.content.split("\n").length;
		const metadata = [];
		if (this.markedSourceIndexes.size > 0) metadata.push(`${this.markedSourceIndexes.size} marked`);
		if (sourceLines) metadata.push(formatStructuralCopyLineCount(sourceLines));
		const right = this.theme.fg("dim", metadata.join(" · "));
		const gap = Math.max(1, contentWidth - visibleWidth(left) - visibleWidth(right));
		return this.fullLine(`${left}${" ".repeat(gap)}${right}`, contentWidth);
	}

	private renderFooter(contentWidth: number, split: boolean): string {
		const filterText = this.filter
			? `${this.theme.fg("dim", "filter:")} ${this.theme.fg("accent", this.filter)}`
			: this.theme.fg("dim", contentWidth >= 70 ? "Type to filter" : "Type");
		const segments = [filterText];
		segments.push(
			`${this.theme.fg("accent", formatCompactKey(this.keys.toggleSelect))}${this.theme.fg("dim", " mark")}`,
		);
		if (split) {
			segments.push(
				`${this.theme.fg("accent", formatCompactKey(this.keys.togglePaneFocus))}${this.theme.fg("dim", " pane")}`,
			);
			if (
				this.paneFocus === "preview" &&
				this.filteredRows[this.selectedIndex]?.block.kind !== "heading"
			) {
				segments.push(
					`${this.theme.fg("accent", this.externalEditorKey)}${this.theme.fg("dim", " editor")}`,
				);
			}
		}
		const scrollKeys = `${formatCompactKey(this.keys.scrollUp)}/${formatCompactKey(this.keys.scrollDown)}`;
		segments.push(`${this.theme.fg("accent", scrollKeys)}${this.theme.fg("dim", " scroll")}`);
		if (contentWidth >= 80) {
			const pageKeys = `${formatCompactKey(this.keys.pageUp)}/${formatCompactKey(this.keys.pageDown)}`;
			segments.push(`${this.theme.fg("accent", pageKeys)}${this.theme.fg("dim", " page")}`);
		}
		if (this.filteredRows[this.selectedIndex]?.isExpandable) {
			segments.push(`${this.theme.fg("accent", "←/→")}${this.theme.fg("dim", " fold")}`);
		}
		segments.push(
			`${this.theme.fg("accent", "Enter")}${this.theme.fg("dim", " copy")}`,
			`${this.theme.fg("accent", "Esc")}${this.theme.fg("dim", " cancel")}`,
		);
		return this.fullLine(segments.join(this.theme.fg("dim", " · ")), contentWidth, true);
	}

	private renderShort(width: number, height: number, selected?: PickerRow): string[] {
		if (height <= 1) return [this.truncate(`anycopy · ${this.nodeLabel}`, width)];
		const rule = "─".repeat(Math.max(0, width - 2));
		if (height === 2) return [this.border(`┌${rule}┐`), this.border(`└${rule}┘`)];
		const lines = [
			this.border(`┌${rule}┐`),
			this.renderHeader(Math.max(1, width - 4), selected),
		];
		if (height >= 4) {
			const summary = selected
				? `→ ${this.formatRowLabel(selected)}`
				: "No matching block";
			lines.push(this.fullLine(summary, Math.max(1, width - 4)));
		}
		while (lines.length < height - 1) lines.push(this.fullLine("", Math.max(1, width - 4)));
		lines.push(this.border(`└${rule}┘`));
		return lines.slice(0, height);
	}

	private renderStacked(width: number, height: number, selected?: PickerRow): string[] {
		const contentWidth = width - 4;
		const typeWidth = Math.min(12, Math.max(8, Math.floor((width - 7) * 0.2)));
		const blockWidth = Math.max(1, width - 7 - typeWidth);
		const rule = "─".repeat(width - 2);
		const paneHeights = getStructuralCopyStackedPaneHeights(
			height,
			Math.max(1, this.filteredRows.length),
		);
		const renderedPreview = this.renderPreviewViewport(
			selected?.block,
			contentWidth,
			paneHeights.previewHeight,
		);
		const preview = renderedPreview.lines.map((line) => this.fullLine(line, contentWidth));

		return [
			this.border(`┌${rule}┐`),
			this.renderHeader(contentWidth, selected),
			this.border(createTableJunction([typeWidth, blockWidth], "├", "┬", "┤")),
			`${this.border("│")} ${this.theme.fg("accent", this.fitCell("Type", typeWidth))} ${this.border("│")} ${this.theme.fg(
				"accent",
				this.fitCell("Block", blockWidth),
			)} ${this.border("│")}`,
			this.border(createTableJunction([typeWidth, blockWidth], "├", "┼", "┤")),
			...this.renderTableRows(typeWidth, blockWidth, paneHeights.selectorHeight),
			this.renderBorderIndicator(
				createTableJunction([typeWidth, blockWidth], "├", "┴", "┤"),
				renderedPreview.above,
				"above",
			),
			...preview,
			this.renderBorderIndicator(`├${rule}┤`, renderedPreview.below, "below"),
			this.renderFooter(contentWidth, false),
			this.border(`└${rule}┘`),
		].slice(0, height);
	}

	private renderSplit(
		width: number,
		height: number,
		layout: Extract<StructuralCopyLayout, { mode: "split" }>,
		selected?: PickerRow,
	): string[] {
		const rule = "─".repeat(width - 2);
		const { selectorWidth, previewWidth } = layout;
		const selectorContentWidth = selectorWidth - 2;
		const previewContentWidth = previewWidth - 2;
		const bodyHeight = getStructuralCopySplitBodyHeight(height);
		const visibleRows = this.getVisibleRows(bodyHeight);
		const renderedPreview = this.renderPreviewViewport(
			selected?.block,
			previewContentWidth,
			bodyHeight,
		);
		const previewLines = renderedPreview.lines;
		const paneLine = (left: string, right: string): string =>
			`${this.border("│")} ${this.fitCell(left, selectorContentWidth)} ${this.border("│")} ${this.fitCell(right, previewContentWidth)} ${this.border("│")}`;
		const body: string[] = [];
		for (let index = 0; index < bodyHeight; index++) {
			const visible = visibleRows[index];
			let selectorLine = "";
			if (visible) {
				const marker = `${visible.selected ? "→" : " "}${this.markedSourceIndexes.has(visible.row.sourceIndex) ? "*" : " "} `;
				const role =
					this.paneFocus === "preview"
						? "dim"
						: visible.selected
							? "accent"
							: "muted";
				selectorLine = this.theme.fg(
					role,
					this.fitCell(
						`${marker}${this.formatRowLabel(visible.row)}`,
						selectorContentWidth,
					),
				);
			} else if (visibleRows.length === 0 && index === 0) {
				selectorLine = this.theme.fg("warning", `No blocks match “${this.filter}”`);
			}
			body.push(paneLine(selectorLine, previewLines[index] ?? ""));
		}

		return [
			this.border(`┌${rule}┐`),
			this.renderHeader(width - 4, selected),
			this.renderBorderIndicator(
				`├${"─".repeat(selectorWidth)}┬${"─".repeat(previewWidth)}┤`,
				renderedPreview.above,
				"above",
			),
			...body,
			this.renderBorderIndicator(
				`├${"─".repeat(selectorWidth)}┴${"─".repeat(previewWidth)}┤`,
				renderedPreview.below,
				"below",
			),
			this.renderFooter(width - 4, true),
			this.border(`└${rule}┘`),
		].slice(0, height);
	}

	render(width: number): string[] {
		const height = Math.max(1, this.getViewportHeight());
		const layout = getStructuralCopyLayout(width, this.paneFocus);
		this.layoutMode = layout.mode;
		const selected = this.filteredRows[this.selectedIndex];
		if (layout.mode === "compact" || height < 11) {
			return this.renderShort(layout.width, height, selected);
		}
		return layout.mode === "split"
			? this.renderSplit(layout.width, height, layout, selected)
			: this.renderStacked(layout.width, height, selected);
	}

	invalidate(): void {
		this.previewCache = null;
		this.lastPreviewHeight = 0;
	}
}

export const pickStructuralBlocks = async (
	ctx: ExtensionContext,
	nodeLabel: string,
	blocks: readonly StructuralBlock[],
	keys: StructuralCopyPickerKeys,
	autoClose: StructuralBlockPickerAutoClose,
): Promise<StructuralBlock[] | null> => {
	if (blocks.length === 0) return null;
	const externalEditorCommand = SettingsManager.create(ctx.cwd, getAgentDir(), {
		projectTrusted: ctx.isProjectTrusted(),
	}).getExternalEditorCommand();
	const externalEditorKey = keyText("app.editor.external");
	const workingBlocks = blocks.map((block) => ({ ...block }));
	let state: StructuralCopyPickerState = {
		selectedSourceIndex: 0,
		filter: "",
		paneFocus: "selector",
		previewScrollOffset: 0,
		markedSourceIndexes: [],
		expandedTargetIds: blocks.filter((block) => block.kind === "message" && block.targetId).map((block) => block.targetId as string),
	};

	while (true) {
		const outcome = await ctx.ui.custom<StructuralCopyPickerOutcome>(
			(tui, theme, keybindings, done) =>
				new AnycopyBlockPicker(
					theme,
					nodeLabel,
					workingBlocks,
					keys,
					() => getStructuralCopyViewportHeight(tui.terminal?.rows ?? 40),
					() => tui.requestRender(),
					done,
					(data) => keybindings.matches(data, "app.editor.external"),
					externalEditorKey,
					autoClose,
					state,
				),
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: `${STRUCTURAL_COPY_OVERLAY_WIDTH_RATIO * 100}%`,
					minWidth: 56,
					maxHeight: STRUCTURAL_COPY_OVERLAY_MAX_HEIGHT,
					margin: 1,
				},
				onHandle: (handle) => handle.focus(),
			},
		);

		if (!outcome || outcome.type === "cancel") return null;
		state = outcome.state;
		if (outcome.type === "select") return outcome.blocks;

		const block = workingBlocks[outcome.sourceIndex];
		if (!block) continue;
		const result = await editStructuralBlockInExternalEditor(externalEditorCommand, block);
		if (result.status === "failed") {
			ctx.ui.notify(result.message, "error");
			continue;
		}
		workingBlocks[outcome.sourceIndex] = { ...block, content: result.content };
		state = { ...state, previewScrollOffset: 0 };
	}
};
