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

test("attemptClipboardCopy falls back to bounded OSC 52 for remote payloads rejected by Pi", async () => {
	let output = "";
	const text = "large payload";
	const result = await attemptClipboardCopy(
		text,
		async () => {
			throw new Error("Failed to copy to clipboard");
		},
		{
			largePayloadOsc52MaxBytes: 1024,
			remoteSession: true,
			writeOutput: (data) => {
				output += data;
			},
		},
	);

	assert.deepEqual(result, { ok: true });
	assert.equal(output, `\u001b]52;c;${Buffer.from(text).toString("base64")}\u0007`);
});

test("attemptClipboardCopy preserves the failure when the payload exceeds the OSC 52 bound", async () => {
	const result = await attemptClipboardCopy(
		"too large",
		async () => {
			throw new Error("Failed to copy to clipboard");
		},
		{
			largePayloadOsc52MaxBytes: 4,
			remoteSession: true,
			writeOutput: () => {
				throw new Error("must not write");
			},
		},
	);

	assert.deepEqual(result, {
		ok: false,
		error: "Clipboard payload is 9 bytes, above the configured OSC 52 limit of 4 bytes",
	});
});

test("attemptClipboardCopy does not emit OSC 52 outside remote sessions", async () => {
	let writes = 0;
	const result = await attemptClipboardCopy(
		"hello",
		async () => {
			throw new Error("clipboard unavailable");
		},
		{
			largePayloadOsc52MaxBytes: 1024,
			remoteSession: false,
			writeOutput: () => {
				writes += 1;
			},
		},
	);

	assert.deepEqual(result, { ok: false, error: "clipboard unavailable" });
	assert.equal(writes, 0);
});
