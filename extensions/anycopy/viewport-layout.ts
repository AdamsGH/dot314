import type { PaneFocus } from "./ui-state.ts";

// Reserve the bottom two terminal rows below the bounded overlay. In fullscreen
// mode, those rows contain Pi's final two footer rows.
const HOST_RESERVED_ROWS = 2;
const BALANCED_INITIAL_TREE_RATIO = 0.65;

export function getAnycopyRenderHeight(terminalRows: number): number {
	return Math.max(1, Math.floor(terminalRows) - HOST_RESERVED_ROWS);
}

export function getAnycopyTreeHeight(renderHeight: number): number {
	return Math.max(1, Math.floor(renderHeight * BALANCED_INITIAL_TREE_RATIO));
}

export type PaneLayoutRatios = Record<PaneFocus, number>;

export function getAnycopyTreeVisibleLines(
	availableRows: number,
	paneFocus: PaneFocus = "balanced",
	ratios: PaneLayoutRatios = { balanced: 0.5, tree: 0.85, preview: 0.15 },
): number {
	const rows = Math.max(1, Math.floor(availableRows));
	if (rows === 1) return 1;
	const treeRows = Math.round(rows * ratios[paneFocus]);
	return Math.max(1, Math.min(rows - 1, treeRows));
}
