export const STRUCTURAL_COPY_OVERLAY_HEIGHT_RATIO = 0.7;
export const STRUCTURAL_COPY_OVERLAY_MAX_HEIGHT = 28;
export const STRUCTURAL_COPY_HOST_RESERVED_ROWS = 4;
export const STRUCTURAL_COPY_OVERLAY_WIDTH_RATIO = 0.9;
export const STRUCTURAL_COPY_SPLIT_SELECTOR_MIN = 40;
export const STRUCTURAL_COPY_SPLIT_PREVIEW_MIN = 48;
export const STRUCTURAL_COPY_PREVIEW_FOCUS_SELECTOR_MIN = 20;
export const STRUCTURAL_COPY_SPLIT_CHROME = 3;
export const STRUCTURAL_COPY_SPLIT_MIN_WIDTH =
	STRUCTURAL_COPY_SPLIT_SELECTOR_MIN +
	STRUCTURAL_COPY_SPLIT_PREVIEW_MIN +
	STRUCTURAL_COPY_SPLIT_CHROME;

const STRUCTURAL_COPY_SELECTOR_FOCUS_RATIO = 0.42;
const STRUCTURAL_COPY_PREVIEW_FOCUS_RATIO = 0.2;
const STRUCTURAL_COPY_SPLIT_FIXED_ROWS = 6;
const STRUCTURAL_COPY_STACKED_FIXED_ROWS = 9;
const STRUCTURAL_COPY_STACKED_SELECTOR_RATIO = 0.35;

export type StructuralCopyPaneFocus = "selector" | "preview";

export const toggleStructuralCopyPaneFocus = (
	focus: StructuralCopyPaneFocus,
): StructuralCopyPaneFocus => (focus === "selector" ? "preview" : "selector");

export type StructuralCopyLayout =
	| { mode: "compact"; width: number }
	| {
			mode: "stacked";
			width: number;
			contentWidth: number;
		}
	| {
			mode: "split";
			width: number;
			contentWidth: number;
			selectorWidth: number;
			previewWidth: number;
		};

export const isStructuralCopyPreviewActionAvailable = (
	layoutMode: StructuralCopyLayout["mode"],
	paneFocus: StructuralCopyPaneFocus,
): boolean => layoutMode === "split" && paneFocus === "preview";

export const getStructuralCopyLayout = (
	width: number,
	paneFocus: StructuralCopyPaneFocus = "selector",
): StructuralCopyLayout => {
	const safeWidth = Math.max(1, Math.floor(width));
	if (safeWidth < 20) return { mode: "compact", width: safeWidth };
	if (safeWidth < STRUCTURAL_COPY_SPLIT_MIN_WIDTH) {
		return { mode: "stacked", width: safeWidth, contentWidth: safeWidth - 4 };
	}

	const segmentWidth = safeWidth - STRUCTURAL_COPY_SPLIT_CHROME;
	const selectorWidth =
		paneFocus === "preview"
			? Math.max(
					STRUCTURAL_COPY_PREVIEW_FOCUS_SELECTOR_MIN,
					Math.floor(segmentWidth * STRUCTURAL_COPY_PREVIEW_FOCUS_RATIO),
				)
			: Math.max(
					STRUCTURAL_COPY_SPLIT_SELECTOR_MIN,
					Math.floor(segmentWidth * STRUCTURAL_COPY_SELECTOR_FOCUS_RATIO),
				);
	return {
		mode: "split",
		width: safeWidth,
		contentWidth: safeWidth - 4,
		selectorWidth,
		previewWidth: segmentWidth - selectorWidth,
	};
};

export const getStructuralCopyViewportHeight = (terminalRows: number): number =>
	Math.max(
		1,
		Math.min(
			STRUCTURAL_COPY_OVERLAY_MAX_HEIGHT,
			Math.floor(terminalRows * STRUCTURAL_COPY_OVERLAY_HEIGHT_RATIO),
			Math.floor(terminalRows) - STRUCTURAL_COPY_HOST_RESERVED_ROWS,
		),
	);

export const getStructuralCopySplitBodyHeight = (viewportHeight: number): number =>
	Math.max(1, Math.floor(viewportHeight) - STRUCTURAL_COPY_SPLIT_FIXED_ROWS);

export type StructuralCopyPreviewWindow = {
	start: number;
	end: number;
	above: number;
	below: number;
	showAbove: boolean;
	showBelow: boolean;
};

export const getStructuralCopyPreviewWindow = (
	lineCount: number,
	height: number,
	requestedOffset: number,
): StructuralCopyPreviewWindow => {
	const safeLineCount = Math.max(0, Math.floor(lineCount));
	const safeHeight = Math.max(0, Math.floor(height));
	if (safeLineCount === 0 || safeHeight === 0) {
		return {
			start: 0,
			end: 0,
			above: 0,
			below: safeLineCount,
			showAbove: false,
			showBelow: false,
		};
	}
	const maxStart = Math.max(0, safeLineCount - safeHeight);
	const start = Math.max(0, Math.min(Math.floor(requestedOffset), maxStart));
	const end = Math.min(safeLineCount, start + safeHeight);
	const above = start;
	const below = safeLineCount - end;
	return {
		start,
		end,
		above,
		below,
		showAbove: above > 0,
		showBelow: below > 0,
	};
};

export const getStructuralCopyStackedPaneHeights = (
	viewportHeight: number,
	itemCount: number,
): { selectorHeight: number; previewHeight: number } => {
	const availableRows = Math.max(
		2,
		Math.floor(viewportHeight) - STRUCTURAL_COPY_STACKED_FIXED_ROWS,
	);
	const selectorHeight = Math.min(
		Math.max(1, itemCount),
		Math.max(1, availableRows - 1),
		Math.max(1, Math.round(availableRows * STRUCTURAL_COPY_STACKED_SELECTOR_RATIO)),
	);
	return {
		selectorHeight,
		previewHeight: Math.max(1, availableRows - selectorHeight),
	};
};

export const formatStructuralCopyLineCount = (lineCount: number): string =>
	`${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
