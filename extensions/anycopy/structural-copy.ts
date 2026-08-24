export type StructuralBlockKind =
	| "message"
	| "heading"
	| "code"
	| "json"
	| "table"
	| "ordered-list"
	| "unordered-list"
	| "ordered-list-item"
	| "quote";
export type StructuralBlockPickerAutoClose = "never" | "under-three" | "always";

export const DEFAULT_STRUCTURAL_BLOCK_PICKER_AUTO_CLOSE: StructuralBlockPickerAutoClose =
	"under-three";

export type StructuralBlock = {
	kind: StructuralBlockKind;
	content: string;
	targetId?: string;
	parentTargetId?: string;
	language?: string;
	title?: string;
	jsonPath?: string;
	headingId?: string;
	parentHeadingId?: string;
	headingLevel?: number;
	startLine?: number;
	endLine?: number;
};

type MarkdownHeading = {
	id: string;
	level: number;
	title: string;
	startLine: number;
	endLine: number;
	parentHeadingId?: string;
};

const isTableLine = (line: string): boolean => {
	const trimmed = line.trim();
	return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length >= 2;
};

const parseTableRow = (line: string): string[] =>
	line
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());

const isTableSeparator = (line: string): boolean => {
	const cells = parseTableRow(line);
	return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
};

type MarkdownListMarker = {
	indent: number;
	ordered: boolean;
};

const matchListItemStart = (line: string): MarkdownListMarker | null => {
	const match = /^(\s*)(?:(\d+[.)])|([-*+]))\s+(.*)$/.exec(line);
	if (!match) return null;
	return {
		indent: match[1]?.length ?? 0,
		ordered: Boolean(match[2]),
	};
};

const unwrapBlockquoteLine = (line: string): string => line.replace(/^\s{0,3}> ?/, "");

const isListContinuation = (
	line: string,
	rootIndent: number,
	ordered: boolean,
): boolean => {
	const marker = matchListItemStart(line);
	if (marker) {
		return marker.indent > rootIndent ||
			(marker.indent === rootIndent && marker.ordered === ordered);
	}
	const indentation = /^(\s+)/.exec(line)?.[1]?.length ?? 0;
	return indentation > rootIndent && /^\s+\S/.test(line);
};

const countTopLevelListItems = (lines: readonly string[]): number => {
	const root = matchListItemStart(lines[0] ?? "");
	if (!root) return 0;
	return lines.filter((line) => {
		const marker = matchListItemStart(line);
		return marker?.indent === root.indent && marker.ordered === root.ordered;
	}).length;
};

const matchHeading = (line: string): { level: number; title: string } | null => {
	const match = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
	if (!match) return null;
	return { level: match[1]?.length ?? 1, title: match[2]?.trim() ?? "" };
};

const scanMarkdownHeadings = (lines: readonly string[]): MarkdownHeading[] => {
	const headings: MarkdownHeading[] = [];
	let fence: { character: string; length: number } | null = null;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		if (fence) {
			const escaped = fence.character === "`" ? "\\`" : "~";
			if (new RegExp(`^\\s*${escaped}{${fence.length},}\\s*$`).test(line)) fence = null;
			continue;
		}
		const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
		if (fenceMatch) {
			const marker = fenceMatch[1] ?? "```";
			fence = { character: marker[0] ?? "`", length: marker.length };
			continue;
		}
		const heading = matchHeading(line);
		if (!heading) continue;
		headings.push({
			id: `heading:${index}`,
			level: heading.level,
			title: heading.title,
			startLine: index,
			endLine: lines.length,
		});
	}

	const stack: MarkdownHeading[] = [];
	for (let index = 0; index < headings.length; index++) {
		const heading = headings[index] as MarkdownHeading;
		while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= heading.level) stack.pop();
		heading.parentHeadingId = stack[stack.length - 1]?.id;
		stack.push(heading);
		for (let next = index + 1; next < headings.length; next++) {
			const candidate = headings[next] as MarkdownHeading;
			if (candidate.level <= heading.level) {
				heading.endLine = candidate.startLine;
				break;
			}
		}
	}
	return headings;
};

const containingHeading = (
	headings: readonly MarkdownHeading[],
	lineIndex: number,
): MarkdownHeading | undefined =>
	[...headings]
		.reverse()
		.find((heading) => heading.startLine < lineIndex && lineIndex < heading.endLine);

const withLocation = (
	block: StructuralBlock,
	headings: readonly MarkdownHeading[],
	startLine: number,
	endLine: number,
): StructuralBlock => {
	if (headings.length === 0) return block;
	return {
		...block,
		parentHeadingId: containingHeading(headings, startLine)?.id,
		parentTargetId: containingHeading(headings, startLine)?.id,
		startLine,
		endLine,
	};
};

const serializeJsonValue = (value: unknown): string => JSON.stringify(value, null, 2) ?? "null";

const formatJsonPathSegment = (key: string, arrayIndex: boolean): string =>
	arrayIndex ? `[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;

const appendJsonValueTargets = (
	blocks: StructuralBlock[],
	value: unknown,
	parentTargetId: string,
	parentPath: string,
	startLine: number,
	endLine: number,
): void => {
	if (value === null || typeof value !== "object") return;
	const entries = Array.isArray(value)
		? value.map((child, index) => [String(index), child] as const)
		: Object.entries(value as Record<string, unknown>);
	for (const [key, child] of entries) {
		const segment = formatJsonPathSegment(key, Array.isArray(value));
		const jsonPath = `${parentPath}${segment}`;
		const targetId = `${parentTargetId}:${encodeURIComponent(key)}`;
		blocks.push({
			kind: "json",
			content: serializeJsonValue(child),
			targetId,
			parentTargetId,
			title: segment,
			jsonPath,
			startLine,
			endLine,
		});
		appendJsonValueTargets(blocks, child, targetId, jsonPath, startLine, endLine);
	}
};

/** Extract copyable Markdown structures and heading sections in document order. */
export const extractStructuralBlocks = (markdown: string): StructuralBlock[] => {
	const lines = markdown.split("\n");
	const headings = scanMarkdownHeadings(lines);
	const headingByLine = new Map(headings.map((heading) => [heading.startLine, heading]));
	const blocks: StructuralBlock[] = [];
	let index = 0;

	while (index < lines.length) {
		const heading = headingByLine.get(index);
		if (heading) {
			blocks.push({
				kind: "heading",
				content: lines.slice(heading.startLine, heading.endLine).join("\n").trimEnd(),
				targetId: heading.id,
				parentTargetId: heading.parentHeadingId,
				title: heading.title,
				headingId: heading.id,
				parentHeadingId: heading.parentHeadingId,
				headingLevel: heading.level,
				startLine: heading.startLine,
				endLine: heading.endLine,
			});
			index++;
			continue;
		}

		const line = lines[index] ?? "";
		const fenceMatch = /^(\s*)(```+|~~~+)(.*)$/.exec(line);
		if (fenceMatch) {
			const fence = fenceMatch[2] ?? "```";
			const fenceChar = fence[0] ?? "`";
			const closePattern = new RegExp(`^\\s*${fenceChar === "`" ? "\\`" : "~"}{${fence.length},}.*`);
			const blockStart = index;
			const contentStart = index + 1;
			let end = contentStart;
			while (end < lines.length && !closePattern.test(lines[end] ?? "")) end++;
			const content = lines.slice(contentStart, end).join("\n");
			const language = (fenceMatch[3] ?? "").trim() || "text";
			const codeTargetId = `code:${blockStart}`;
			const codeBlock = withLocation(
					{
						kind: "code",
						content,
						language,
						targetId: codeTargetId,
					},
					headings,
					blockStart,
					end < lines.length ? end + 1 : end,
				);
			blocks.push(codeBlock);
			if (language.toLowerCase() === "json") {
				try {
					appendJsonValueTargets(blocks, JSON.parse(content), codeTargetId, "$", blockStart, end);
				} catch {
					// Invalid JSON remains an ordinary code target.
				}
			}
			index = end < lines.length ? end + 1 : end;
			continue;
		}

		if (isTableLine(line)) {
			const start = index;
			let end = index;
			while (end < lines.length && isTableLine(lines[end] ?? "")) end++;
			if (end - start >= 2 && isTableSeparator(lines[start + 1] ?? "")) {
				blocks.push(
					withLocation(
						{ kind: "table", content: lines.slice(start, end).join("\n"), targetId: `table:${start}` },
						headings,
						start,
						end,
					),
				);
				index = end;
				continue;
			}
		}

		const listRoot = matchListItemStart(line);
		if (listRoot) {
			const start = index;
			const topLevelItemStarts = [start];
			index++;
			while (index < lines.length) {
				const current = lines[index] ?? "";
				const marker = matchListItemStart(current);
				if (isListContinuation(current, listRoot.indent, listRoot.ordered)) {
					if (
						marker?.indent === listRoot.indent &&
						marker.ordered === listRoot.ordered
					) {
						topLevelItemStarts.push(index);
					}
					index++;
					continue;
				}
				if (
					current.trim() === "" &&
					isListContinuation(lines[index + 1] ?? "", listRoot.indent, listRoot.ordered)
				) {
					index++;
					continue;
				}
				break;
			}

			const kind = listRoot.ordered ? "ordered-list" : "unordered-list";
			const targetId = `${kind}:${start}`;
			const listBlock = withLocation(
				{ kind, content: lines.slice(start, index).join("\n").trimEnd(), targetId },
				headings,
				start,
				index,
			);
			blocks.push(listBlock);

			if (listRoot.ordered) {
				for (let itemIndex = 0; itemIndex < topLevelItemStarts.length; itemIndex++) {
					const itemStart = topLevelItemStarts[itemIndex] as number;
					const itemEnd = topLevelItemStarts[itemIndex + 1] ?? index;
					const itemBlock: StructuralBlock = {
						kind: "ordered-list-item",
						content: lines.slice(itemStart, itemEnd).join("\n").trimEnd(),
						targetId: `ordered-list-item:${itemStart}`,
						parentTargetId: targetId,
						title: lines[itemStart]?.trim() ?? `Item ${itemIndex + 1}`,
					};
					blocks.push(headings.length === 0 ? itemBlock : {
						...itemBlock,
						parentHeadingId: listBlock.parentHeadingId,
						startLine: itemStart,
						endLine: itemEnd,
					});
				}
			}
			continue;
		}

		if (/^\s{0,3}>/.test(line)) {
			const start = index;
			index++;
			while (index < lines.length && /^\s{0,3}>/.test(lines[index] ?? "")) index++;
			blocks.push(
				withLocation(
					{
						kind: "quote",
						content: lines.slice(start, index).map(unwrapBlockquoteLine).join("\n"),
						targetId: `quote:${start}`,
					},
					headings,
					start,
					index,
				),
			);
			continue;
		}

		index++;
	}

	return blocks;
};

/** Add a global-only root target without changing focused-tree extraction semantics. */
export const addWholeMessageStructuralTarget = (
	markdown: string,
	blocks: readonly StructuralBlock[],
): StructuralBlock[] => {
	const targetId = "message:root";
	return [
		{ kind: "message", content: markdown, targetId, title: "Entire message", startLine: 0, endLine: markdown.split("\n").length },
		...blocks.map((block) => block.parentTargetId ? block : { ...block, parentTargetId: targetId }),
	];
};

export const shouldAutoCloseStructuralBlockPicker = (
	policy: StructuralBlockPickerAutoClose,
	candidateCount: number,
): boolean => policy === "always" || (policy === "under-three" && candidateCount < 3);

/** Toggle one stable source index and return whether it is marked afterward. */
export const toggleStructuralBlockMark = (markedIndexes: Set<number>, sourceIndex: number): boolean => {
	if (markedIndexes.delete(sourceIndex)) return false;
	markedIndexes.add(sourceIndex);
	return true;
};

const containsBlock = (
	container: StructuralBlock,
	candidate: StructuralBlock,
	blockById: ReadonlyMap<string, StructuralBlock>,
): boolean => {
	if (!container.targetId || container.targetId === candidate.targetId) return false;
	let parentTargetId = candidate.parentTargetId;
	while (parentTargetId) {
		if (parentTargetId === container.targetId) return true;
		parentTargetId = blockById.get(parentTargetId)?.parentTargetId;
	}
	return false;
};

export const resolveStructuralBlockSelectionIndexes = (
	markedIndexes: ReadonlySet<number>,
	focusedIndex: number | undefined,
	blocks?: readonly StructuralBlock[],
): number[] => {
	const selected = markedIndexes.size > 0
		? [...markedIndexes].sort((left, right) => left - right)
		: focusedIndex === undefined
			? []
			: [focusedIndex];
	if (!blocks || selected.length < 2) return selected;
	const blockById = new Map(blocks.flatMap((block) => block.targetId ? [[block.targetId, block] as const] : []));
	return selected.filter((candidateIndex) => {
		const candidate = blocks[candidateIndex];
		if (!candidate) return false;
		return !selected.some((containerIndex) => {
			if (containerIndex === candidateIndex) return false;
			const container = blocks[containerIndex];
			return container ? containsBlock(container, candidate, blockById) : false;
		});
	});
};

export const joinStructuralBlocksForClipboard = (blocks: readonly StructuralBlock[]): string =>
	blocks.map((block) => block.content).join("\n\n");

export const getStructuralBlockPreviewLanguage = (block: StructuralBlock): string | undefined =>
	block.kind === "json" ? "json" : block.kind === "code" ? block.language ?? "text" : undefined;

export const countStructuralBlocksByKind = (
	blocks: readonly StructuralBlock[],
): Record<StructuralBlockKind, number> => {
	const counts: Record<StructuralBlockKind, number> = {
		message: 0,
		heading: 0,
		code: 0,
		json: 0,
		table: 0,
		"ordered-list": 0,
		"unordered-list": 0,
		"ordered-list-item": 0,
		quote: 0,
	};
	for (const block of blocks) counts[block.kind]++;
	return counts;
};

export type StructuralBlockSelectItem = {
	value: string;
	label: string;
	description: string;
	targetIndex: number;
	depth: number;
	targetId?: string;
	parentTargetId?: string;
	isExpandable: boolean;
	searchText: string;
};

const KIND_LABELS: Record<StructuralBlockKind, string> = {
	message: "Message",
	heading: "Section",
	code: "Code",
	json: "JSON value",
	table: "Table",
	"ordered-list": "Ordered list",
	"unordered-list": "Unordered list",
	"ordered-list-item": "List item",
	quote: "Quote",
};

export const getStructuralBlockKindLabel = (kind: StructuralBlockKind): string => KIND_LABELS[kind];

const lineCountText = (count: number): string => `${count} ${count === 1 ? "line" : "lines"}`;
const itemCountText = (count: number): string => `${count} ${count === 1 ? "item" : "items"}`;

const getTargetDepth = (
	block: StructuralBlock,
	blockById: ReadonlyMap<string, StructuralBlock>,
): number => {
	let depth = 0;
	let parentId = block.parentTargetId;
	while (parentId) {
		depth++;
		parentId = blockById.get(parentId)?.parentTargetId;
	}
	return depth;
};

export const summarizeStructuralBlock = (
	block: StructuralBlock,
	blocks: readonly StructuralBlock[] = [],
): string => {
	const lines = block.content.split("\n");
	switch (block.kind) {
		case "message":
			return lineCountText(lines.length);
		case "heading": {
			const nestedBlocks = blocks.filter(
				(candidate) => candidate.kind !== "heading" && candidate.kind !== "ordered-list-item" &&
					block.startLine !== undefined && candidate.startLine !== undefined && candidate.endLine !== undefined &&
					block.startLine <= candidate.startLine && (block.endLine ?? -1) >= candidate.endLine,
			).length;
			return `${nestedBlocks} ${nestedBlocks === 1 ? "block" : "blocks"} · ${lineCountText(lines.length)}`;
		}
		case "code":
			return `${block.language ?? "text"} · ${lineCountText(lines.length)}`;
		case "json": {
			let value: unknown;
			try { value = JSON.parse(block.content); } catch { return lineCountText(lines.length); }
			if (Array.isArray(value)) return `${itemCountText(value.length)} · array`;
			if (value !== null && typeof value === "object") {
				const count = Object.keys(value).length;
				return `${count} ${count === 1 ? "key" : "keys"} · object`;
			}
			return value === null ? "null" : typeof value;
		}
		case "table": {
			const rows = lines.filter(isTableLine);
			const columns = rows[0] ? parseTableRow(rows[0]).length : 0;
			const dataRows = Math.max(0, rows.length - 2);
			return `${dataRows}×${columns} table`;
		}
		case "ordered-list":
		case "unordered-list":
			return `${itemCountText(countTopLevelListItems(lines))} · ${lineCountText(lines.length)}`;
		case "ordered-list-item":
			return lineCountText(lines.length);
		case "quote":
			return lineCountText(lines.length);
	}
};

export const buildStructuralBlockSelectItems = (
	blocks: readonly StructuralBlock[],
): StructuralBlockSelectItem[] => {
	const blockById = new Map(blocks.flatMap((block) => block.targetId ? [[block.targetId, block] as const] : []));
	const parentIds = new Set(blocks.flatMap((block) => block.parentTargetId ? [block.parentTargetId] : []));

	return blocks.map((block, targetIndex) => {
		const depth = getTargetDepth(block, blockById);
		const label = block.kind === "message"
			? block.title || "Entire message"
			: block.kind === "heading"
			? block.title || "Untitled section"
			: block.kind === "json"
				? block.title ?? "value"
			: block.kind === "code"
				? `${KIND_LABELS.code} [${block.language ?? "text"}]`
			: block.kind === "ordered-list-item"
				? block.title ?? KIND_LABELS[block.kind]
				: KIND_LABELS[block.kind];
		const description = summarizeStructuralBlock(block, blocks);
		const searchableContent = block.kind === "heading" || block.kind === "message" ? "" : block.content;
		const searchText = `${block.kind} ${label} ${block.jsonPath ?? ""} ${description} ${searchableContent}`.toLowerCase();
		return {
			value: `${targetIndex}\t${searchText}`,
			label: `[${block.kind}] ${label}`,
			description,
			targetIndex,
			depth,
			targetId: block.targetId,
			parentTargetId: block.parentTargetId,
			isExpandable: Boolean(block.targetId && parentIds.has(block.targetId)),
			searchText,
		};
	});
};

const hasAncestor = (
	item: StructuralBlockSelectItem,
	ancestorId: string,
	itemByTargetId: ReadonlyMap<string, StructuralBlockSelectItem>,
): boolean => {
	let parentId = item.parentTargetId;
	while (parentId) {
		if (parentId === ancestorId) return true;
		parentId = itemByTargetId.get(parentId)?.parentTargetId;
	}
	return false;
};

export const getVisibleStructuralBlockItems = (
	items: readonly StructuralBlockSelectItem[],
	expandedTargetIds: ReadonlySet<string>,
	filter: string,
): StructuralBlockSelectItem[] => {
	const itemByTargetId = new Map(items.flatMap((item) => item.targetId ? [[item.targetId, item] as const] : []));
	const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const matches = (item: StructuralBlockSelectItem): boolean =>
		terms.length === 0 || terms.every((term) => item.searchText.includes(term));

	if (terms.length > 0) {
		const directlyMatched = new Set(items.filter(matches));
		return items.filter((item) => {
			if (directlyMatched.has(item)) return true;
			return [...directlyMatched].some((candidate) => {
				if (item.targetId && hasAncestor(candidate, item.targetId, itemByTargetId)) return true;
				return Boolean(candidate.targetId && hasAncestor(item, candidate.targetId, itemByTargetId));
			});
		});
	}

	return items.filter((item) => {
		let parentId = item.parentTargetId;
		while (parentId) {
			if (!expandedTargetIds.has(parentId)) return false;
			parentId = itemByTargetId.get(parentId)?.parentTargetId;
		}
		return true;
	});
};
