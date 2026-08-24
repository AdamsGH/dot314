import assert from "node:assert/strict";
import test from "node:test";

import {
	buildStatusTextLines,
	resolveEnterAction,
	applyInclusiveRangeSelection,
	shouldClearSelectionAfterCopy,
	togglePaneFocus,
	wrapHintSegments,
} from "../ui-state.ts";

test("resolveEnterAction copies the focused node when shortcut-opened navigation is unavailable", () => {
	assert.equal(resolveEnterAction("off", 0, false), "copy-focused");
	assert.equal(resolveEnterAction("output-with-tool-call", 0, false), "copy-focused");
	assert.equal(resolveEnterAction("output", 2, false), "copy-selection");
	assert.equal(resolveEnterAction("off", 0, true), "navigate");
});

test("togglePaneFocus cycles through balanced, tree-only, and preview-focused layouts", () => {
	assert.equal(togglePaneFocus("balanced"), "tree");
	assert.equal(togglePaneFocus("tree"), "preview");
	assert.equal(togglePaneFocus("preview"), "balanced");
});

test("shouldClearSelectionAfterCopy supports every configured policy", () => {
	assert.equal(shouldClearSelectionAfterCopy("never", "enter", 3), false);
	assert.equal(shouldClearSelectionAfterCopy("always", "shortcut", 1), true);
	assert.equal(shouldClearSelectionAfterCopy("always-enter", "shortcut", 2), false);
	assert.equal(shouldClearSelectionAfterCopy("always-enter", "enter", 0), false);
	assert.equal(shouldClearSelectionAfterCopy("always-enter", "enter", 1), true);
	assert.equal(shouldClearSelectionAfterCopy("multi-select", "shortcut", 1), false);
	assert.equal(shouldClearSelectionAfterCopy("multi-select", "shortcut", 2), true);
	assert.equal(shouldClearSelectionAfterCopy("multi-select-enter", "shortcut", 2), false);
	assert.equal(shouldClearSelectionAfterCopy("multi-select-enter", "enter", 1), false);
	assert.equal(shouldClearSelectionAfterCopy("multi-select-enter", "enter", 2), true);
});

test("compact status keeps one row across idle, selection, and copy feedback", () => {
	const hints = ["S+C copy", "? help"];
	assert.deepEqual(buildStatusTextLines("compact", "? help", hints, 40), ["? help"]);
	assert.deepEqual(buildStatusTextLines("compact", "3 selected nodes", hints, 40), ["3 selected nodes"]);
	assert.deepEqual(buildStatusTextLines("compact", "Copied 3 nodes", hints, 40), ["Copied 3 nodes"]);
});

test("full status reserves one status row plus stable wrapped hints", () => {
	const hints = ["S+C copy", "S+V range", "? help"];
	const idle = buildStatusTextLines("full", "Ready", hints, 22);
	const selected = buildStatusTextLines("full", "2 selected nodes", hints, 22);
	assert.equal(idle.length, selected.length);
	assert.deepEqual(idle.slice(1), selected.slice(1));
});

test("wrapHintSegments wraps only between complete hints", () => {
	assert.deepEqual(wrapHintSegments(["Enter navigate", "S+V range", "S+A toggle"], 26), [
		"Enter navigate · S+V range",
		"S+A toggle",
	]);
});

test("wrapHintSegments keeps all hints on one line when they fit", () => {
	assert.deepEqual(wrapHintSegments(["S+C copy", "S+X clear"], 40), ["S+C copy · S+X clear"]);
});

test("wrapHintSegments uses the terminal width measurer supplied by the renderer", () => {
	const doubleWidth = (text: string): number => text.length * 2;
	assert.deepEqual(wrapHintSegments(["one", "two"], 12, doubleWidth), ["one", "two"]);
});

test("applyInclusiveRangeSelection adds the forward range to the baseline selection", () => {
	assert.deepEqual(
		[...applyInclusiveRangeSelection(new Set(["outside"]), ["a", "b", "c", "d"], "b", "d")],
		["outside", "b", "c", "d"],
	);
});

test("applyInclusiveRangeSelection supports shrinking and reversing around the anchor", () => {
	const baseline = new Set(["outside"]);
	assert.deepEqual([...applyInclusiveRangeSelection(baseline, ["a", "b", "c", "d"], "c", "a")], [
		"outside",
		"a",
		"b",
		"c",
	]);
	assert.deepEqual([...applyInclusiveRangeSelection(baseline, ["a", "b", "c", "d"], "c", "b")], [
		"outside",
		"b",
		"c",
	]);
});

test("applyInclusiveRangeSelection removes the range when its anchor was already selected", () => {
	const baseline = new Set(["outside", "a", "b", "c", "d"]);
	assert.deepEqual(
		[...applyInclusiveRangeSelection(baseline, ["a", "b", "c", "d"], "b", "d")],
		["outside", "a"],
	);
});

test("applyInclusiveRangeSelection reverses each mixed selection independently", () => {
	const baseline = new Set(["outside", "a", "c"]);
	assert.deepEqual(
		[...applyInclusiveRangeSelection(baseline, ["a", "b", "c", "d"], "a", "d")],
		["outside", "b", "d"],
	);
});

test("applyInclusiveRangeSelection retains classic additive selection mode", () => {
	const baseline = new Set(["outside", "a", "c"]);
	assert.deepEqual(
		[...applyInclusiveRangeSelection(baseline, ["a", "b", "c", "d"], "a", "d", "select")],
		["outside", "a", "c", "b", "d"],
	);
});

test("applyInclusiveRangeSelection leaves the baseline unchanged when the range is not visible", () => {
	assert.deepEqual([...applyInclusiveRangeSelection(new Set(["saved"]), ["a", "b"], "hidden", "b")], ["saved"]);
});
