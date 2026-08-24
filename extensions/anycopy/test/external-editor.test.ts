import assert from "node:assert/strict";
import test from "node:test";

import {
	editStructuralBlockInExternalEditor,
	getStructuralBlockEditorSuffix,
	type ExternalEditorRuntime,
} from "../external-editor.ts";
import type { StructuralBlock } from "../structural-copy.ts";

const block = (content: string, language = "typescript"): StructuralBlock => ({
	kind: "code",
	content,
	language,
});

test("editor suffix follows block kind and fenced language", () => {
	assert.equal(getStructuralBlockEditorSuffix(block("", "typescript")), "ts");
	assert.equal(getStructuralBlockEditorSuffix(block("", "python")), "py");
	assert.equal(getStructuralBlockEditorSuffix(block("", "custom-lang")), "customlang");
	assert.equal(getStructuralBlockEditorSuffix({ kind: "unordered-list", content: "- one" }), "md");
});

test("external editor reads successful edits after its owning overlay has closed", async () => {
	const events: string[] = [];
	const path = "/tmp/pi-anycopy-test.ts";
	const runtime: ExternalEditorRuntime = {
		createTempPath: (suffix) => {
			assert.equal(suffix, "ts");
			return path;
		},
		write: async (actualPath, content) => {
			events.push(`write:${actualPath}:${content}`);
		},
		read: async (actualPath) => {
			events.push(`read:${actualPath}`);
			return "const edited = true;\n";
		},
		remove: async (actualPath) => {
			events.push(`remove:${actualPath}`);
		},
		run: async (command, args) => {
			events.push(`run:${command}:${args.join("|")}`);
			return 0;
		},
	};
	const result = await editStructuralBlockInExternalEditor(
		"nvim --clean",
		block("const original = true;"),
		runtime,
	);

	assert.deepEqual(result, { status: "complete", content: "const edited = true;" });
	assert.deepEqual(events, [
		`write:${path}:const original = true;`,
		`run:nvim:--clean|${path}`,
		`read:${path}`,
		`remove:${path}`,
	]);
});

test("failed editor launch restores the TUI and removes the temporary file", async () => {
	const events: string[] = [];
	const runtime: ExternalEditorRuntime = {
		createTempPath: () => "/tmp/pi-anycopy-failed.md",
		write: async () => events.push("write"),
		read: async () => {
			throw new Error("read should not run");
		},
		remove: async () => events.push("remove"),
		run: async () => {
			events.push("run");
			throw new Error("spawn failed");
		},
	};
	const result = await editStructuralBlockInExternalEditor(
		"nvim",
		{ kind: "quote", content: "> text" },
		runtime,
	);

	assert.deepEqual(result, { status: "failed", message: "spawn failed" });
	assert.deepEqual(events, ["write", "run", "remove"]);
});
