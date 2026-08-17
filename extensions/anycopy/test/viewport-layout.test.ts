import assert from "node:assert/strict";
import test from "node:test";

import {
	getAnycopyRenderHeight,
	getAnycopyTreeHeight,
	getAnycopyTreeVisibleLines,
} from "../viewport-layout.ts";

test("getAnycopyRenderHeight reserves two terminal rows below the overlay", () => {
	assert.equal(getAnycopyRenderHeight(40), 38);
});

test("getAnycopyRenderHeight floors fractional terminal heights", () => {
	assert.equal(getAnycopyRenderHeight(40.9), 38);
});

test("getAnycopyRenderHeight always leaves at least one component row", () => {
	assert.equal(getAnycopyRenderHeight(1), 1);
});

test("getAnycopyTreeHeight provides a balanced constructor height", () => {
	assert.equal(getAnycopyTreeHeight(38), 24);
});

test("getAnycopyTreeVisibleLines keeps both panes visible across three layouts", () => {
	assert.equal(getAnycopyTreeVisibleLines(28, "balanced"), 14);
	assert.equal(getAnycopyTreeVisibleLines(28, "tree"), 24);
	assert.equal(getAnycopyTreeVisibleLines(28, "preview"), 4);
	assert.equal(getAnycopyTreeVisibleLines(1, "balanced"), 1);
});

test("getAnycopyTreeVisibleLines applies custom tree ratios", () => {
	const ratios = { balanced: 0.6, tree: 0.75, preview: 0.25 };
	assert.equal(getAnycopyTreeVisibleLines(20, "balanced", ratios), 12);
	assert.equal(getAnycopyTreeVisibleLines(20, "tree", ratios), 15);
	assert.equal(getAnycopyTreeVisibleLines(20, "preview", ratios), 5);
});

test("getAnycopyTreeVisibleLines retains at least one row for each pane", () => {
	const ratios = { balanced: 0.5, tree: 0.999, preview: 0.001 };
	assert.equal(getAnycopyTreeVisibleLines(10, "tree", ratios), 9);
	assert.equal(getAnycopyTreeVisibleLines(10, "preview", ratios), 1);
});
