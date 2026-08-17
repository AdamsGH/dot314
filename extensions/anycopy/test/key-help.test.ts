import assert from "node:assert/strict";
import test from "node:test";
import {
	createKeyHelpLayout,
	createTableJunction,
	formatCompactKey,
	formatConfiguredKey,
	formatHelpRowKeys,
	getKeyHelpPreferredWidth,
	type KeyHelpRow,
} from "../key-help-data.ts";

const rows: KeyHelpRow[] = [
	{ keys: ["shift+v"], label: "toggle range selection", setting: "keys.toggleRangeSelection" },
	{ keys: ["shift+pageup"], label: "page preview up", setting: "keys.pageUp" },
	{
		keys: ["shift+alt+c"],
		label: "copy with tool calls",
		setting: "keys.copyWithToolCall",
		available: false,
		requires: "copy.enableToolCallCopy",
	},
];

test("configured keys are formatted consistently for status and help", () => {
	assert.equal(formatConfiguredKey("shift+ctrl+t"), "Shift+Ctrl+T");
	assert.equal(formatConfiguredKey("escape"), "Esc");
	assert.equal(formatConfiguredKey("shift+pageup"), "Shift+PageUp");
	assert.equal(formatCompactKey("shift+pagedown"), "S+PgDn");
});

test("help rows display effective bindings", () => {
	assert.equal(
		formatHelpRowKeys({ keys: ["ctrl+k", "ctrl+j"], label: "scroll preview", setting: "keys.scroll" }),
		"Ctrl+K / Ctrl+J",
	);
});

test("settings and unavailable actions are independently opt-in", () => {
	const everyday = createKeyHelpLayout(rows, 90, false, false);
	assert.deepEqual(everyday.columns.map((column) => column.label), ["Key", "Action"]);
	assert.equal(everyday.rows.length, 2);
	assert.ok(everyday.rows.every((row) => row.setting === undefined));

	const settings = createKeyHelpLayout(rows, 90, true, false);
	assert.deepEqual(settings.columns.map((column) => column.label), ["Key", "Action", "Setting (anycopy.*)"]);
	assert.equal(settings.rows.length, 2);
	assert.equal(settings.rows[0]?.setting, "keys.toggleRangeSelection");

	const unavailable = createKeyHelpLayout(rows, 90, false, true);
	assert.equal(unavailable.rows.length, 3);
	assert.match(unavailable.rows[2]?.action ?? "", /requires copy\.enableToolCallCopy/);
	assert.equal(unavailable.rows[2]?.available, false);
});

test("table junctions connect all active columns", () => {
	assert.equal(createTableJunction([5, 8], "├", "┬", "┤"), "├───────┬──────────┤");
	assert.equal(createTableJunction([5, 8, 10], "├", "┼", "┤"), "├───────┼──────────┼────────────┤");
	assert.equal(createTableJunction([5, 8], "├", "┴", "┤"), "├───────┴──────────┤");
});

test("preferred width grows only when optional detail is shown", () => {
	const everyday = getKeyHelpPreferredWidth(rows, false, false);
	const settings = getKeyHelpPreferredWidth(rows, true, false);
	const unavailable = getKeyHelpPreferredWidth(rows, false, true);
	assert.equal(everyday, 56);
	assert.ok(settings > everyday);
	assert.ok(unavailable > everyday);
	assert.ok(settings < getKeyHelpPreferredWidth(rows, true, true));
	const extended = getKeyHelpPreferredWidth(
		[...rows, { keys: ["shift+k"], label: "new action", setting: "keys.aMuchLongerNewSettingName" }],
		true,
		true,
	);
	assert.ok(extended > getKeyHelpPreferredWidth(rows, true, true));
});

test("column widths use the available space without exceeding it", () => {
	for (const showSettings of [false, true]) {
		const layout = createKeyHelpLayout(rows, 70, showSettings, true);
		const renderedWidth = layout.columns.reduce((sum, column) => sum + column.width, 0) + layout.columns.length * 3 + 1;
		assert.equal(renderedWidth, 70);
	}
});
