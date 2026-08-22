export type PaneFocus = "balanced" | "tree" | "preview";
export type CopyTrigger = "shortcut" | "enter";
export type EnterCopyMode = "off" | "output" | "output-with-tool-call";
export type EnterAction = "navigate" | "copy-selection" | "copy-focused";
export type HintMode = "full" | "compact";
export type ClearSelectionAfterCopy = "never" | "always" | "always-enter" | "multi-select" | "multi-select-enter";

export function resolveEnterAction(
	mode: EnterCopyMode,
	selectedCount: number,
	navigationAvailable: boolean,
): EnterAction {
	if (mode !== "off" && selectedCount > 0) return "copy-selection";
	return navigationAvailable ? "navigate" : "copy-focused";
}

export function togglePaneFocus(focus: PaneFocus): PaneFocus {
	if (focus === "balanced") return "tree";
	if (focus === "tree") return "preview";
	return "balanced";
}

export function shouldClearSelectionAfterCopy(
	mode: ClearSelectionAfterCopy,
	trigger: CopyTrigger,
	copiedCount: number,
): boolean {
	if (mode === "always") return copiedCount > 0;
	if (mode === "always-enter") return trigger === "enter" && copiedCount > 0;
	if (mode === "multi-select") return copiedCount > 1;
	return mode === "multi-select-enter" && trigger === "enter" && copiedCount > 1;
}

export function buildStatusTextLines(
	mode: HintMode,
	status: string,
	hints: readonly string[],
	width: number,
	measureWidth: (text: string) => number = (text) => text.length,
): string[] {
	if (mode === "compact") return [status];
	return [status, ...wrapHintSegments(hints, width, measureWidth)];
}

export function wrapHintSegments(
	segments: readonly string[],
	width: number,
	measureWidth: (text: string) => number = (text) => text.length,
): string[] {
	if (width <= 0 || segments.length === 0) return [];

	const separator = " · ";
	const lines: string[] = [];
	let line = "";

	for (const segment of segments) {
		if (!segment) continue;
		const candidate = line ? `${line}${separator}${segment}` : segment;
		if (line && measureWidth(candidate) > width) {
			lines.push(line);
			line = segment;
		} else {
			line = candidate;
		}
	}

	if (line) lines.push(line);
	return lines;
}

export function selectInclusiveRange(
	baselineIds: ReadonlySet<string>,
	orderedVisibleIds: readonly string[],
	anchorId: string,
	focusedId: string,
): Set<string> {
	const selected = new Set(baselineIds);
	const anchorIndex = orderedVisibleIds.indexOf(anchorId);
	const focusedIndex = orderedVisibleIds.indexOf(focusedId);
	if (anchorIndex < 0 || focusedIndex < 0) return selected;

	const start = Math.min(anchorIndex, focusedIndex);
	const end = Math.max(anchorIndex, focusedIndex);
	for (let index = start; index <= end; index += 1) {
		const id = orderedVisibleIds[index];
		if (id) selected.add(id);
	}
	return selected;
}
