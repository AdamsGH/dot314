import assert from "node:assert/strict";
import test from "node:test";
import { buildToolContextPreview } from "../tool-context-preview.ts";

test("generic tool context is derived from arbitrary invocation data", () => {
	const preview = buildToolContextPreview({
		name: "my_private_checker",
		arguments: {
			action: "diagnostics",
			files: ["/project/a.ts", "/project/b.ts"],
			options: { root: "/project", timeoutMs: 30000 },
		},
	});
	assert.ok(preview);
	assert.equal(preview.tool, "my_private_checker");
	assert.deepEqual(preview.rows.slice(0, 4), [
		{ kind: "scalar", label: "action", value: "diagnostics" },
		{ kind: "group", label: "files", value: "2" },
		{ kind: "item", label: "1.", value: "/project/a.ts" },
		{ kind: "item", label: "2.", value: "/project/b.ts" },
	]);
	assert.ok(preview.rows.some((row) => row.label === "options.root" && row.value === "/project"));
	assert.ok(preview.rows.some((row) => row.label === "options.timeoutMs" && row.value === "30000"));
});

test("missing parent invocation produces no context block", () => {
	assert.equal(buildToolContextPreview(null), null);
});

test("empty and absent argument values are structurally omitted", () => {
	const preview = buildToolContextPreview({
		name: "anything",
		arguments: { missing: undefined, blank: "   ", emptyObject: {}, zero: 0, disabled: false },
	});
	assert.ok(preview);
	assert.deepEqual(preview.rows, [
		{ kind: "scalar", label: "zero", value: "0" },
		{ kind: "scalar", label: "disabled", value: "false" },
	]);
});

test("generic tool context bounds arrays and long values", () => {
	const preview = buildToolContextPreview({
		name: "anything",
		arguments: {
			items: Array.from({ length: 10 }, (_, index) => `item-${index}`),
			long: "x".repeat(500),
		},
	});
	assert.ok(preview);
	assert.ok(preview.rows.some((row) => row.kind === "group" && row.label === "items" && row.value === "10"));
	assert.ok(preview.rows.some((row) => row.kind === "item" && row.label === "…" && row.value === "2 more"));
	assert.ok(preview.rows.every((row) => row.label.length <= 32 && row.value.length <= 180));
	assert.ok(preview.rows.every((row) => row.value !== "item-9"));
});
