import assert from "node:assert/strict";
import test from "node:test";

import {
	STRUCTURAL_COPY_HOST_RESERVED_ROWS,
	STRUCTURAL_COPY_OVERLAY_MAX_HEIGHT,
	STRUCTURAL_COPY_OVERLAY_WIDTH_RATIO,
	STRUCTURAL_COPY_SPLIT_MIN_WIDTH,
	formatStructuralCopyLineCount,
	getStructuralCopyLayout,
	getStructuralCopyPreviewWindow,
	getStructuralCopySplitBodyHeight,
	getStructuralCopyStackedPaneHeights,
	getStructuralCopyViewportHeight,
	isStructuralCopyPreviewActionAvailable,
	toggleStructuralCopyPaneFocus,
} from "../structural-copy-layout.ts";
test("overlay uses most of a wide terminal while retaining responsive margins", () => {
	assert.equal(STRUCTURAL_COPY_OVERLAY_WIDTH_RATIO, 0.9);
});

test("responsive breakpoint is derived from both pane minima and chrome", () => {
	assert.equal(STRUCTURAL_COPY_SPLIT_MIN_WIDTH, 91);
	assert.deepEqual(getStructuralCopyLayout(90), {
		mode: "stacked",
		width: 90,
		contentWidth: 86,
	});
	assert.deepEqual(getStructuralCopyLayout(91), {
		mode: "split",
		width: 91,
		contentWidth: 87,
		selectorWidth: 40,
		previewWidth: 48,
	});
});

test("preview focus reallocates a wide split to approximately 20/80", () => {
	const selectorFocused = getStructuralCopyLayout(105, "selector");
	const previewFocused = getStructuralCopyLayout(105, "preview");
	assert.equal(selectorFocused.mode, "split");
	assert.equal(previewFocused.mode, "split");
	if (selectorFocused.mode !== "split" || previewFocused.mode !== "split") return;
	assert.equal(selectorFocused.selectorWidth + selectorFocused.previewWidth + 3, 105);
	assert.equal(previewFocused.selectorWidth, 20);
	assert.equal(previewFocused.previewWidth, 82);
	assert.ok(previewFocused.previewWidth > selectorFocused.previewWidth);
	assert.equal(toggleStructuralCopyPaneFocus("selector"), "preview");
	assert.equal(toggleStructuralCopyPaneFocus("preview"), "selector");
	assert.equal(isStructuralCopyPreviewActionAvailable("split", "preview"), true);
	assert.equal(isStructuralCopyPreviewActionAvailable("split", "selector"), false);
	assert.equal(isStructuralCopyPreviewActionAvailable("stacked", "preview"), false);
});

test("viewport height scales with the terminal and leaves host context visible", () => {
	assert.equal(STRUCTURAL_COPY_OVERLAY_MAX_HEIGHT, "70%");
	assert.equal(STRUCTURAL_COPY_HOST_RESERVED_ROWS, 4);
	assert.equal(getStructuralCopyViewportHeight(40), 28);
	assert.equal(getStructuralCopyViewportHeight(80), 56);
	assert.equal(getStructuralCopyViewportHeight(120), 84);
	assert.equal(getStructuralCopyViewportHeight(24), 16);
	assert.equal(getStructuralCopyViewportHeight(8), 4);
	assert.equal(getStructuralCopySplitBodyHeight(28), 22);
	assert.deepEqual(getStructuralCopyStackedPaneHeights(28, 4), {
		selectorHeight: 4,
		previewHeight: 15,
	});
	assert.deepEqual(getStructuralCopyStackedPaneHeights(28, 100), {
		selectorHeight: 7,
		previewHeight: 12,
	});
});

test("preview overflow metadata keeps every viewport row available for content", () => {
	assert.deepEqual(getStructuralCopyPreviewWindow(5, 25, 0), {
		start: 0,
		end: 5,
		above: 0,
		below: 0,
		showAbove: false,
		showBelow: false,
	});
	assert.deepEqual(getStructuralCopyPreviewWindow(30, 10, 0), {
		start: 0,
		end: 10,
		above: 0,
		below: 20,
		showAbove: false,
		showBelow: true,
	});
	assert.deepEqual(getStructuralCopyPreviewWindow(30, 10, 8), {
		start: 8,
		end: 18,
		above: 8,
		below: 12,
		showAbove: true,
		showBelow: true,
	});
	assert.deepEqual(getStructuralCopyPreviewWindow(30, 10, 100), {
		start: 20,
		end: 30,
		above: 20,
		below: 0,
		showAbove: true,
		showBelow: false,
	});
});

test("compact fallback never invents width beyond the host viewport", () => {
	for (const width of [1, 8, 19]) {
		assert.deepEqual(getStructuralCopyLayout(width), { mode: "compact", width });
	}
});

test("header metadata keeps line grammar compact", () => {
	assert.equal(formatStructuralCopyLineCount(1), "1 line");
	assert.equal(formatStructuralCopyLineCount(8), "8 lines");
});
