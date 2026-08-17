import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type ToolCallInvocation = {
	name: string;
	arguments: Record<string, unknown>;
};

type SessionTreeNodeLike = {
	entry: SessionEntry;
};

const MAX_PARENT_TRAVERSAL_DEPTH = 30;

export const getToolCallId = (entry: SessionEntry): string | null => {
	if (entry.type !== "message") return null;
	const message = entry.message as { role?: string; toolCallId?: unknown };
	if (message.role !== "toolResult") return null;
	return typeof message.toolCallId === "string" ? message.toolCallId : null;
};

export const getToolName = (entry: SessionEntry): string | null => {
	if (entry.type !== "message") return null;
	const message = entry.message as { role?: string; toolName?: unknown };
	if (message.role !== "toolResult") return null;
	return typeof message.toolName === "string" ? message.toolName : null;
};

export const resolveToolCallFromParents = (
	entry: SessionEntry,
	nodeById: ReadonlyMap<string, SessionTreeNodeLike>,
): ToolCallInvocation | null => {
	const toolCallId = getToolCallId(entry);
	if (!toolCallId) return null;

	let parentId = entry.parentId;
	for (let depth = 0; depth < MAX_PARENT_TRAVERSAL_DEPTH && parentId; depth += 1) {
		const parentNode = nodeById.get(parentId);
		if (!parentNode) return null;

		const parentEntry = parentNode.entry;
		if (parentEntry.type === "message") {
			const message = parentEntry.message as { role?: string; content?: unknown };
			if (message.role === "assistant" && Array.isArray(message.content)) {
				const block = message.content.find((candidate: unknown) => {
					if (typeof candidate !== "object" || candidate === null) return false;
					const value = candidate as Record<string, unknown>;
					return (
						value.type === "toolCall" &&
						value.id === toolCallId &&
						typeof value.name === "string" &&
						typeof value.arguments === "object" &&
						value.arguments !== null &&
						!Array.isArray(value.arguments)
					);
				}) as { name: string; arguments: Record<string, unknown> } | undefined;

				if (block) return { name: block.name, arguments: block.arguments };
			}
		}

		parentId = parentEntry.parentId;
	}

	return null;
};

const compactJson = (value: unknown): string => {
	try {
		return JSON.stringify(value) ?? "null";
	} catch {
		return "[unserializable]";
	}
};

export const formatToolCallInvocation = (invocation: ToolCallInvocation): string =>
	`[${invocation.name}: ${compactJson(invocation.arguments)}]`;

export const formatToolCallResultForClipboard = (
	entry: SessionEntry,
	resultContent: string,
	nodeById: ReadonlyMap<string, SessionTreeNodeLike>,
	enabled: boolean,
): string | null => {
	if (!enabled) return null;
	const invocation = resolveToolCallFromParents(entry, nodeById);
	if (!invocation) return null;
	return `toolCall:\n\n${formatToolCallInvocation(invocation)}\n\ntoolResult:\n\n${resultContent}`;
};
