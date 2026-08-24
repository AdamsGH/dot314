import assert from "node:assert/strict";
import test from "node:test";

import {
	addWholeMessageStructuralTarget,
	buildStructuralBlockSelectItems,
	extractStructuralBlocks,
	getStructuralBlockPreviewLanguage,
	getVisibleStructuralBlockItems,
	joinStructuralBlocksForClipboard,
	resolveStructuralBlockSelectionIndexes,
	shouldAutoCloseStructuralBlockPicker,
	toggleStructuralBlockMark,
} from "../structural-copy.ts";

test("extracts fenced code without fences and supports longer closing fences", () => {
	const blocks = extractStructuralBlocks("```ts\nconst value = 1;\n````\nafter");
	assert.deepEqual(blocks, [{ kind: "code", content: "const value = 1;", language: "ts", targetId: "code:0" }]);
});

test("keeps shorter fences inside a longer fenced code block", () => {
	const blocks = extractStructuralBlocks("````\nfirst\n```\nsecond\n````");
	assert.equal(blocks[0]?.content, "first\n```\nsecond");
});

test("extracts tables only when a separator row is present", () => {
	const markdown = "| A | B |\n| --- | :---: |\n| 1 | 2 |";
	assert.deepEqual(extractStructuralBlocks(markdown), [{ kind: "table", content: markdown, targetId: "table:0" }]);
	assert.deepEqual(extractStructuralBlocks("| A | B |\n| 1 | 2 |"), []);
});

test("extracts loose and nested unordered lists as one block", () => {
	const markdown = "- first\n  - nested\n\n- second\n\nprose";
	assert.deepEqual(extractStructuralBlocks(markdown), [
		{
			kind: "unordered-list",
			content: "- first\n  - nested\n\n- second",
			targetId: "unordered-list:0",
		},
	]);
});

test("extracts consecutive blockquotes and preserves mixed document order", () => {
	const markdown = "> first\n> second\n\n```\ncode\n```\n\n1. item";
	assert.deepEqual(
		extractStructuralBlocks(markdown).map((block) => block.kind),
		["quote", "code", "ordered-list", "ordered-list-item"],
	);
});

test("copies blockquotes as clean Markdown while preserving their rendered content", () => {
	const markdown = [
		"> Native Control D DoH works with `RouterOS 7.24`.",
		">",
		"> During uptime I logged one transient error:",
		">",
		"> ```text",
		"> DoH server connection error",
		"> ```",
		">",
		"> > Nested warning",
	].join("\n");
	const [quote] = extractStructuralBlocks(markdown);

	assert.deepEqual(quote, {
		kind: "quote",
		content: [
			"Native Control D DoH works with `RouterOS 7.24`.",
			"",
			"During uptime I logged one transient error:",
			"",
			"```text",
			"DoH server connection error",
			"```",
			"",
			"> Nested warning",
		].join("\n"),
		targetId: "quote:0",
	});
	assert.equal(getStructuralBlockPreviewLanguage(quote), undefined);
	assert.equal(joinStructuralBlocksForClipboard([quote]), quote?.content);
});

test("separates list styles and exposes ordered top-level items for selective copy", () => {
	const markdown = [
		"1. First finding",
		"    - first detail",
		"    - wrapped detail",
		"      continuation",
		"",
		"2. Second finding",
		"    - second detail",
		"",
		"- unrelated bullet",
		"- another bullet",
	].join("\n");
	const blocks = extractStructuralBlocks(markdown);

	assert.deepEqual(blocks.map((block) => block.kind), [
		"ordered-list",
		"ordered-list-item",
		"ordered-list-item",
		"unordered-list",
	]);
	assert.equal(blocks[1]?.content, [
		"1. First finding",
		"    - first detail",
		"    - wrapped detail",
		"      continuation",
	].join("\n"));
	assert.equal(blocks[2]?.content, "2. Second finding\n    - second detail");
	assert.equal(blocks[1]?.parentTargetId, blocks[0]?.targetId);
	assert.equal(blocks[2]?.parentTargetId, blocks[0]?.targetId);
	assert.equal(blocks[3]?.content, "- unrelated bullet\n- another bullet");

	const items = buildStructuralBlockSelectItems(blocks);
	assert.deepEqual(items.map((item) => item.label), [
		"[ordered-list] Ordered list",
		"[ordered-list-item] 1. First finding",
		"[ordered-list-item] 2. Second finding",
		"[unordered-list] Unordered list",
	]);
	assert.deepEqual(items.map((item) => item.description), [
		"2 items · 7 lines",
		"4 lines",
		"2 lines",
		"2 items · 2 lines",
	]);
	assert.deepEqual(
		getVisibleStructuralBlockItems(items, new Set(), "").map((item) => item.targetIndex),
		[0, 3],
	);
	assert.deepEqual(
		getVisibleStructuralBlockItems(items, new Set([blocks[0]?.targetId ?? ""]), "").map((item) => item.targetIndex),
		[0, 1, 2, 3],
	);
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set([0, 1]), 1, blocks), [0]);
	assert.equal(
		joinStructuralBlocksForClipboard([blocks[1], blocks[2]].filter((block) => block !== undefined)),
		"1. First finding\n    - first detail\n    - wrapped detail\n      continuation\n\n2. Second finding\n    - second detail",
	);
});

test("picker labels use structural metadata instead of raw first-line snippets", () => {
	const blocks = extractStructuralBlocks("```ts\na\n```\n\n> quote\n\n```js\nb\n```");
	const items = buildStructuralBlockSelectItems(blocks);
	assert.deepEqual(
		items.map((item) => item.label),
		["[code] Code [ts]", "[quote] Quote", "[code] Code [js]"],
	);
	assert.deepEqual(items.map((item) => item.description), ["ts · 1 line", "1 line", "js · 1 line"]);
	assert.equal(items.some((item) => item.description.includes("quote")), false);
	assert.match(items[0]?.value ?? "", /^0\tcode /);
});

test("headings form nested copyable sections with complete source ranges", () => {
	const markdown = [
		"# Alpha",
		"Intro prose.",
		"- first",
		"- second",
		"## Beta",
		"> nested quote",
		"# Gamma",
		"Tail prose.",
	].join("\n");
	const blocks = extractStructuralBlocks(markdown);
	assert.deepEqual(blocks.map((block) => block.kind), ["heading", "unordered-list", "heading", "quote", "heading"]);
	assert.equal(blocks[0]?.content, markdown.split("\n").slice(0, 6).join("\n"));
	assert.equal(blocks[2]?.content, "## Beta\n> nested quote");
	assert.equal(blocks[2]?.parentHeadingId, blocks[0]?.headingId);
	assert.equal(blocks[3]?.parentHeadingId, blocks[2]?.headingId);
	assert.equal(blocks[4]?.content, "# Gamma\nTail prose.");
});

test("ordered list items do not inflate containing section block counts", () => {
	const blocks = extractStructuralBlocks("# Findings\n1. One\n2. Two");
	const items = buildStructuralBlockSelectItems(blocks);
	assert.deepEqual(items.map((item) => item.depth), [0, 1, 2, 2]);
	assert.equal(items[0]?.description, "1 block · 3 lines");
});

test("heading visibility follows explicit expansion while filters reveal matching ancestry", () => {
	const blocks = extractStructuralBlocks(
		"# Alpha\n- first\n## Beta\n> nested quote\n# Gamma\n```ts\nconst tail = true;\n```",
	);
	const items = buildStructuralBlockSelectItems(blocks);
	const ids = (visible: typeof items): string[] => visible.map((item) => item.label);
	assert.deepEqual(ids(getVisibleStructuralBlockItems(items, new Set(), "")), [
		"[heading] Alpha",
		"[heading] Gamma",
	]);
	assert.deepEqual(ids(getVisibleStructuralBlockItems(items, new Set(["heading:0"]), "")), [
		"[heading] Alpha",
		"[unordered-list] Unordered list",
		"[heading] Beta",
		"[heading] Gamma",
	]);
	assert.deepEqual(ids(getVisibleStructuralBlockItems(items, new Set(), "nested quote")), [
		"[heading] Alpha",
		"[heading] Beta",
		"[quote] Quote",
	]);
});

test("empty and prose-only content have no structural choices", () => {
	assert.deepEqual(extractStructuralBlocks(""), []);
	assert.deepEqual(extractStructuralBlocks("A plain paragraph."), []);
});

test("whole-message target is an explicit root without changing ordinary extraction", () => {
	const markdown = "# Alpha\n- one\n\n```json\n{\"nested\":{\"enabled\":true}}\n```";
	const ordinary = extractStructuralBlocks(markdown);
	assert.equal(ordinary.some((block) => block.kind === "message"), false);

	const globalTargets = addWholeMessageStructuralTarget(markdown, ordinary);
	assert.equal(globalTargets[0]?.kind, "message");
	assert.equal(globalTargets[0]?.title, "Entire message");
	assert.equal(globalTargets[0]?.content, markdown);
	assert.equal(globalTargets.filter((block) => !block.parentTargetId).length, 1);
	assert.equal(globalTargets[1]?.parentTargetId, globalTargets[0]?.targetId);
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set([0, 1, 2]), 0, globalTargets), [0]);
});

test("valid JSON code exposes independently copyable nested values", () => {
	const blocks = extractStructuralBlocks([
		"```json",
		'{"service":{"ports":[8080,9090],"enabled":true},"name":"api"}',
		"```",
	].join("\n"));
	assert.deepEqual(blocks.map((block) => block.kind), ["code", "json", "json", "json", "json", "json", "json"]);
	const items = buildStructuralBlockSelectItems(blocks);
	assert.equal(items[0]?.isExpandable, true);
	assert.deepEqual(items.map((item) => item.depth), [0, 1, 2, 3, 3, 2, 1]);
	assert.equal(items[1]?.label, "[json] .service");
	assert.match(items[1]?.searchText ?? "", /\$\.service/);
	assert.equal(blocks[2]?.content, "[\n  8080,\n  9090\n]");
	assert.equal(blocks[3]?.content, "8080");
	assert.equal(blocks[5]?.content, "true");
	assert.equal(blocks[6]?.content, '"api"');

	const codeId = blocks[0]?.targetId;
	const serviceId = blocks[1]?.targetId;
	assert.ok(codeId);
	assert.ok(serviceId);
	assert.deepEqual(
		getVisibleStructuralBlockItems(items, new Set([codeId]), "").map((item) => item.targetIndex),
		[0, 1, 6],
	);
	assert.deepEqual(
		getVisibleStructuralBlockItems(items, new Set([codeId, serviceId]), "").map((item) => item.targetIndex),
		[0, 1, 2, 5, 6],
	);
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set([1, 2, 3]), 3, blocks), [1]);
});

test("invalid JSON and non-JSON fences remain ordinary code targets", () => {
	assert.deepEqual(extractStructuralBlocks("```json\n{broken}\n```").map((block) => block.kind), ["code"]);
	assert.deepEqual(extractStructuralBlocks("```js\n({nested: true})\n```").map((block) => block.kind), ["code"]);
});

test("nested JSON targets retain JSON syntax highlighting metadata", () => {
	const jsonTargets = extractStructuralBlocks("```json\n{\"nested\":{\"enabled\":true}}\n```");
	const root = jsonTargets[0];
	const nested = jsonTargets[1];
	assert.ok(root);
	assert.ok(nested);
	assert.equal(getStructuralBlockPreviewLanguage(root), "json");
	assert.equal(getStructuralBlockPreviewLanguage(nested), "json");
	assert.equal(
		getStructuralBlockPreviewLanguage({ kind: "code", content: "echo ready", language: "shell" }),
		"bash",
	);
	assert.equal(getStructuralBlockPreviewLanguage({ kind: "quote", content: "> plain" }), undefined);
});

test("marked block indexes commit in document order and focused block is the fallback", () => {
	const marked = new Set<number>();
	assert.equal(toggleStructuralBlockMark(marked, 2), true);
	assert.equal(toggleStructuralBlockMark(marked, 0), true);
	assert.equal(toggleStructuralBlockMark(marked, 2), false);
	assert.deepEqual([...marked], [0]);
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set([3, 1, 2]), 0), [1, 2, 3]);
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set(), 2), [2]);
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set(), undefined), []);
});

test("selected heading sections suppress overlapping nested selections", () => {
	const blocks = extractStructuralBlocks("# Alpha\n- first\n## Beta\n> quote\n# Gamma\n- tail");
	assert.deepEqual(resolveStructuralBlockSelectionIndexes(new Set([0, 1, 2, 3, 5]), 0, blocks), [0, 5]);
	assert.equal(
		joinStructuralBlocksForClipboard([blocks[0], blocks[5]].filter((block) => block !== undefined)),
		"# Alpha\n- first\n## Beta\n> quote\n\n- tail",
	);
});

test("block picker auto-close policy uses the unfiltered candidate count", () => {
	assert.equal(shouldAutoCloseStructuralBlockPicker("never", 1), false);
	assert.equal(shouldAutoCloseStructuralBlockPicker("under-three", 1), true);
	assert.equal(shouldAutoCloseStructuralBlockPicker("under-three", 2), true);
	assert.equal(shouldAutoCloseStructuralBlockPicker("under-three", 3), false);
	assert.equal(shouldAutoCloseStructuralBlockPicker("always", 20), true);
});

test("multiple structural blocks are joined without changing single-block content", () => {
	const one = { kind: "quote" as const, content: "> one" };
	const two = { kind: "unordered-list" as const, content: "- two" };
	assert.equal(joinStructuralBlocksForClipboard([one]), "> one");
	assert.equal(joinStructuralBlocksForClipboard([one, two]), "> one\n\n- two");
});
