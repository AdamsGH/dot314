import type { ToolCallInvocation } from "./tool-call-copy.ts";

const MAX_ARGUMENT_ROWS = 24;
const MAX_ARRAY_ITEMS = 8;
const MAX_DEPTH = 3;
const MAX_VALUE_CHARS = 180;
const MAX_LABEL_CHARS = 32;

export type ToolContextRow = {
	kind: "scalar" | "group" | "item";
	label: string;
	value: string;
};

export type ToolContextPreview = {
	tool: string;
	rows: ToolContextRow[];
	omitted: boolean;
};

const clip = (value: string, limit: number): string =>
	value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;

const scalarText = (value: unknown): string | null => {
	if (value === null) return "null";
	if (typeof value === "string") return value.replace(/[\r\n\t]+/g, " ");
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
	if (typeof value === "undefined") return "undefined";
	return null;
};

const compactObject = (value: unknown): string => {
	try {
		return clip(JSON.stringify(value) ?? "null", MAX_VALUE_CHARS);
	} catch {
		return "[unserializable]";
	}
};

const flattenArgument = (rows: ToolContextRow[], label: string, value: unknown, depth: number): boolean => {
	if (rows.length >= MAX_ARGUMENT_ROWS) return true;
	if (typeof value === "undefined" || (typeof value === "string" && !value.trim())) return false;
	const scalar = scalarText(value);
	if (scalar !== null) {
		rows.push({ kind: "scalar", label: clip(label, MAX_LABEL_CHARS), value: clip(scalar, MAX_VALUE_CHARS) });
		return false;
	}
	if (Array.isArray(value)) {
		rows.push({ kind: "group", label: clip(label, MAX_LABEL_CHARS), value: String(value.length) });
		for (let index = 0; index < Math.min(value.length, MAX_ARRAY_ITEMS); index += 1) {
			if (rows.length >= MAX_ARGUMENT_ROWS) return true;
			const item = value[index];
			const itemScalar = scalarText(item);
			rows.push({ kind: "item", label: `${index + 1}.`, value: clip(itemScalar ?? compactObject(item), MAX_VALUE_CHARS) });
		}
		if (value.length > MAX_ARRAY_ITEMS) rows.push({ kind: "item", label: "…", value: `${value.length - MAX_ARRAY_ITEMS} more` });
		return false;
	}
	if (typeof value === "object" && value !== null) {
		const entries = Object.entries(value as Record<string, unknown>);
		if (depth >= MAX_DEPTH) {
			rows.push({ kind: "scalar", label: clip(label, MAX_LABEL_CHARS), value: compactObject(value) });
			return false;
		}
		if (entries.length === 0) return false;
		for (const [key, nested] of entries) {
			if (flattenArgument(rows, label ? `${label}.${key}` : key, nested, depth + 1)) return true;
		}
		return false;
	}
	rows.push({ kind: "scalar", label: clip(label, MAX_LABEL_CHARS), value: clip(String(value), MAX_VALUE_CHARS) });
	return false;
};

export const buildToolContextPreview = (invocation: ToolCallInvocation | null): ToolContextPreview | null => {
	if (!invocation) return null;
	const rows: ToolContextRow[] = [];
	let omitted = false;
	for (const [key, value] of Object.entries(invocation.arguments)) {
		if (flattenArgument(rows, key, value, 0)) {
			omitted = true;
			break;
		}
	}
	return { tool: clip(invocation.name, MAX_VALUE_CHARS), rows, omitted };
};
