import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	formatToolCallInvocation,
	formatToolCallResultForClipboard,
	resolveToolCallFromParents,
} from "../tool-call-copy.ts";

type Node = { entry: SessionEntry };

const entry = (value: Record<string, unknown>): SessionEntry => value as unknown as SessionEntry;

const assistant = entry({
	type: "message",
	id: "assistant",
	parentId: "root",
	message: {
		role: "assistant",
		content: [
			{ type: "toolCall", id: "call-a", name: "read", arguments: { path: "a.ts" } },
			{ type: "toolCall", id: "call-b", name: "grep", arguments: { pattern: "needle", path: "." } },
		],
	},
});

const nodes = new Map<string, Node>([["assistant", { entry: assistant }]]);

test("resolveToolCallFromParents matches the exact toolCallId", () => {
	const result = entry({
		type: "message",
		id: "result",
		parentId: "assistant",
		message: { role: "toolResult", toolCallId: "call-b", toolName: "grep", content: [] },
	});

	assert.deepEqual(resolveToolCallFromParents(result, nodes), {
		name: "grep",
		arguments: { pattern: "needle", path: "." },
	});
});

test("resolveToolCallFromParents returns null when the matching ancestor call is unavailable", () => {
	const result = entry({
		type: "message",
		id: "result",
		parentId: "assistant",
		message: { role: "toolResult", toolCallId: "missing", toolName: "read", content: [] },
	});

	assert.equal(resolveToolCallFromParents(result, nodes), null);
	assert.equal(resolveToolCallFromParents(result, new Map()), null);
});

test("formatToolCallInvocation uses the compact tree-style representation", () => {
	assert.equal(
		formatToolCallInvocation({ name: "read", arguments: { path: "src/index.ts", limit: 20 } }),
		'[read: {"path":"src/index.ts","limit":20}]',
	);
});

test("formatToolCallResultForClipboard separates enabled matched calls and results", () => {
	const result = entry({
		type: "message",
		id: "result",
		parentId: "assistant",
		message: { role: "toolResult", toolCallId: "call-a", toolName: "read", content: [] },
	});

	assert.equal(formatToolCallResultForClipboard(result, "file body", nodes, false), null);
	assert.equal(
		formatToolCallResultForClipboard(result, "file body", nodes, true),
		'toolCall:\n\n[read: {"path":"a.ts"}]\n\ntoolResult:\n\nfile body',
	);
});
