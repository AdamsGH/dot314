export type KeyHelpRow = {
	keys: string[];
	label: string;
	setting: string;
	available?: boolean;
	requires?: string;
};

export type KeyHelpLayoutRow = {
	key: string;
	action: string;
	setting?: string;
	available: boolean;
};

export type KeyHelpLayout = {
	columns: Array<{ label: string; width: number }>;
	rows: KeyHelpLayoutRow[];
};

export const formatConfiguredKey = (key: string): string => {
	const normalized = key.trim().toLowerCase();
	if (normalized === "space") return "Space";
	if (normalized === "escape") return "Esc";
	if (/^f\d+$/.test(normalized)) return normalized.toUpperCase();
	const namedParts: Record<string, string> = {
		shift: "Shift",
		ctrl: "Ctrl",
		alt: "Alt",
		enter: "Enter",
		tab: "Tab",
		up: "Up",
		down: "Down",
		left: "Left",
		right: "Right",
		pageup: "PageUp",
		pagedown: "PageDown",
		home: "Home",
		end: "End",
	};
	return normalized
		.split("+")
		.map((part) => {
			if (namedParts[part]) return namedParts[part];
			if (part.length === 1) return part.toUpperCase();
			return part;
		})
		.join("+");
};

export const formatCompactKey = (key: string): string =>
	formatConfiguredKey(key)
		.replace(/^Shift(?=\+)/i, "S")
		.replace(/\+Ctrl(?=\+|$)/gi, "+C")
		.replace(/\+Alt(?=\+|$)/gi, "+A")
		.replace(/pageup/gi, "PgUp")
		.replace(/pagedown/gi, "PgDn");

export const formatHelpRowKeys = (row: KeyHelpRow): string => row.keys.map(formatConfiguredKey).join(" / ");

export const getKeyHelpPreferredWidth = (
	rows: readonly KeyHelpRow[],
	showSettings: boolean,
	showUnavailable: boolean,
	measureWidth: (text: string) => number = (text) => text.length,
): number => {
	const visibleRows = rows.filter((row) => row.available !== false || showUnavailable);
	const keyWidth = Math.max(3, ...visibleRows.map((row) => measureWidth(formatHelpRowKeys(row))));
	const actionWidth = Math.max(
		6,
		...visibleRows.map((row) =>
			measureWidth(row.available === false && row.requires ? `${row.label} · requires ${row.requires}` : row.label),
		),
	);
	const settingWidth = showSettings
		? Math.max(7, ...visibleRows.map((row) => measureWidth(row.setting)))
		: 0;
	const columnCount = showSettings ? 3 : 2;
	const naturalWidth = keyWidth + actionWidth + settingWidth + columnCount * 3 + 1;
	return Math.max(56, naturalWidth);
};

export const createTableJunction = (
	widths: readonly number[],
	left: string,
	join: string,
	right: string,
): string => `${left}${widths.map((width) => "─".repeat(width + 2)).join(join)}${right}`;

export const createKeyHelpLayout = (
	rows: readonly KeyHelpRow[],
	width: number,
	showSettings: boolean,
	showUnavailable: boolean,
	measureWidth: (text: string) => number = (text) => text.length,
): KeyHelpLayout => {
	const visibleRows = rows
		.filter((row) => row.available !== false || showUnavailable)
		.map((row) => {
			const available = row.available !== false;
			return {
				key: formatHelpRowKeys(row),
				action: available || !row.requires ? row.label : `${row.label} · requires ${row.requires}`,
				setting: showSettings ? row.setting : undefined,
				available,
			};
		});
	const columnCount = showSettings ? 3 : 2;
	const overhead = columnCount * 3 + 1;
	const availableWidth = Math.max(columnCount * 4, width - overhead);
	const naturalKeyWidth = Math.max(3, ...visibleRows.map((row) => measureWidth(row.key)));
	const naturalActionWidth = Math.max(6, ...visibleRows.map((row) => measureWidth(row.action)));
	const naturalSettingWidth = showSettings
		? Math.max(7, ...visibleRows.map((row) => measureWidth(row.setting ?? "")))
		: 0;
	const naturalContentWidth = naturalKeyWidth + naturalActionWidth + naturalSettingWidth;
	let keyWidth: number;
	let settingWidth: number;
	let actionWidth: number;
	if (naturalContentWidth <= availableWidth) {
		keyWidth = naturalKeyWidth;
		settingWidth = naturalSettingWidth;
		actionWidth = availableWidth - keyWidth - settingWidth;
	} else {
		const keyBudget = showSettings
			? Math.max(3, Math.floor(availableWidth * 0.22))
			: Math.max(3, Math.floor(availableWidth * 0.3));
		keyWidth = Math.min(18, naturalKeyWidth, keyBudget);
		const settingBudget = Math.max(7, Math.floor(availableWidth * 0.38));
		settingWidth = showSettings ? Math.min(32, naturalSettingWidth, settingBudget) : 0;
		actionWidth = Math.max(1, availableWidth - keyWidth - settingWidth);
	}
	const columns = [
		{ label: "Key", width: keyWidth },
		{ label: "Action", width: actionWidth },
	];
	if (showSettings) columns.push({ label: "Setting (anycopy.*)", width: settingWidth });
	return { columns, rows: visibleRows };
};
