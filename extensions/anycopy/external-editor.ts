import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { StructuralBlock } from "./structural-copy.ts";

export type ExternalEditorResult =
	| { status: "complete"; content: string }
	| { status: "failed"; message: string };

export type ExternalEditorRuntime = {
	createTempPath(suffix: string): string;
	write(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
	remove(path: string): Promise<void>;
	run(command: string, args: string[]): Promise<number | null>;
};

const LANGUAGE_SUFFIXES: Record<string, string> = {
	bash: "sh",
	csharp: "cs",
	javascript: "js",
	jsx: "jsx",
	plaintext: "txt",
	python: "py",
	ruby: "rb",
	rust: "rs",
	shell: "sh",
	text: "txt",
	tsx: "tsx",
	typescript: "ts",
	yaml: "yaml",
};

let tempSequence = 0;

export const getStructuralBlockEditorSuffix = (block: StructuralBlock): string => {
	if (block.kind !== "code") return "md";
	const language = (block.language ?? "text").trim().toLowerCase();
	const mapped = LANGUAGE_SUFFIXES[language];
	if (mapped) return mapped;
	const safe = language.replace(/[^a-z0-9]+/g, "").slice(0, 12);
	return safe || "txt";
};

const runEditor = (command: string, args: string[]): Promise<number | null> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.once("error", reject);
		child.once("close", (code) => resolve(code));
	});

const defaultRuntime: ExternalEditorRuntime = {
	createTempPath: (suffix) =>
		join(tmpdir(), `pi-anycopy-${Date.now()}-${process.pid}-${tempSequence++}.${suffix}`),
	write: (path, content) => writeFile(path, content, { encoding: "utf8", mode: 0o600 }),
	read: (path) => readFile(path, "utf8"),
	remove: async (path) => {
		await unlink(path);
	},
	run: runEditor,
};

/** Run the editor after the owning overlay has closed, then read the edited block. */
export const editStructuralBlockInExternalEditor = async (
	command: string,
	block: StructuralBlock,
	runtime: ExternalEditorRuntime = defaultRuntime,
): Promise<ExternalEditorResult> => {
	const commandParts = command.trim().split(/\s+/).filter(Boolean);
	const executable = commandParts.shift();
	if (!executable) return { status: "failed", message: "External editor command is empty" };

	const path = runtime.createTempPath(getStructuralBlockEditorSuffix(block));
	try {
		await runtime.write(path, block.content);
		const exitCode = await runtime.run(executable, [...commandParts, path]);
		if (exitCode !== 0) {
			return {
				status: "failed",
				message: `External editor exited with status ${exitCode ?? "unknown"}`,
			};
		}
		const content = (await runtime.read(path)).replace(/\r?\n$/, "");
		return { status: "complete", content };
	} catch (error) {
		return {
			status: "failed",
			message: error instanceof Error ? error.message : "External editor failed",
		};
	} finally {
		await runtime.remove(path).catch(() => undefined);
	}
};
