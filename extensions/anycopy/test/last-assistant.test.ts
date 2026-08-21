import assert from "node:assert/strict";
import test from "node:test";

import { getLastAssistantText, resolveLatestAssistantCopyShortcut } from "../last-assistant.ts";

const entry = (id: string, message: unknown) => ({
	type: "message",
	id,
	parentId: null,
	timestamp: new Date().toISOString(),
	message,
});

test("returns the latest non-empty assistant text on the active branch", () => {
	const entries = [
		entry("assistant-1", { role: "assistant", content: [{ type: "text", text: "older" }] }),
		entry("user-1", { role: "user", content: [{ type: "text", text: "question" }] }),
		entry("assistant-empty", { role: "assistant", stopReason: "aborted", content: [] }),
		entry("assistant-2", {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "private" },
				{ type: "text", text: "# Result" },
				{ type: "text", text: "- first\n- second" },
			],
		}),
		entry("user-2", { role: "user", content: [{ type: "text", text: "thanks" }] }),
	];

	assert.equal(getLastAssistantText(entries), "# Result\n- first\n- second");
});

test("latest-assistant shortcut is only active for enabled block copy and a configured key", () => {
	assert.equal(resolveLatestAssistantCopyShortcut(false, "shift+b"), null);
	assert.equal(resolveLatestAssistantCopyShortcut(true, "  "), null);
	assert.equal(resolveLatestAssistantCopyShortcut(true, " ctrl+b "), "ctrl+b");
});

test("returns null when the branch has no non-empty assistant text", () => {
	const entries = [
		entry("user-1", { role: "user", content: [{ type: "text", text: "question" }] }),
		entry("assistant-empty", { role: "assistant", content: [{ type: "text", text: "  " }] }),
	];

	assert.equal(getLastAssistantText(entries), null);
});
