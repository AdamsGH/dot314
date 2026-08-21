type TextContentPart = {
	type: "text";
	text: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isTextContentPart = (value: unknown): value is TextContentPart =>
	isRecord(value) && value.type === "text" && typeof value.text === "string";

const extractTextContent = (content: unknown): string => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter(isTextContentPart).map((part) => part.text).join("\n");
};

export const resolveLatestAssistantCopyShortcut = (blockCopyEnabled: boolean, configuredKey: string): string | null => {
	if (!blockCopyEnabled) return null;
	const shortcut = configuredKey.trim();
	return shortcut || null;
};

export const getLastAssistantText = (entries: readonly unknown[]): string | null => {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (!isRecord(entry) || entry.type !== "message" || !isRecord(entry.message)) continue;
		if (entry.message.role !== "assistant") continue;

		const text = extractTextContent(entry.message.content);
		if (text.trim()) return text;
	}
	return null;
};
