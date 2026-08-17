import assert from "node:assert/strict";
import test from "node:test";

import { attemptClipboardCopy } from "../clipboard-copy.ts";

test("attemptClipboardCopy reports successful clipboard writes", async () => {
	let copied = "";
	const result = await attemptClipboardCopy("hello", async (text) => {
		copied = text;
	});

	assert.deepEqual(result, { ok: true });
	assert.equal(copied, "hello");
});

test("attemptClipboardCopy contains rejected clipboard writes", async () => {
	const result = await attemptClipboardCopy("hello", async () => {
		throw new Error("Failed to copy to clipboard");
	});

	assert.deepEqual(result, { ok: false, error: "Failed to copy to clipboard" });
});

test("attemptClipboardCopy contains synchronous clipboard errors", async () => {
	const result = await attemptClipboardCopy("hello", () => {
		throw "clipboard unavailable";
	});

	assert.deepEqual(result, { ok: false, error: "clipboard unavailable" });
});
