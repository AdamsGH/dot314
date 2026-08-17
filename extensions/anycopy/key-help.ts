import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import {
	createKeyHelpLayout,
	createTableJunction,
	formatConfiguredKey,
	type KeyHelpLayoutRow,
	type KeyHelpRow,
} from "./key-help-data.ts";

export class AnycopyKeyHelp implements Component {
	private showSettings = false;
	private showUnavailable = false;

	constructor(
		private readonly theme: Theme,
		private readonly rows: KeyHelpRow[],
		private readonly helpKey: string,
		private readonly settingsKey: string,
		private readonly unavailableKey: string,
		private readonly requestRender: () => void,
		private readonly done: () => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, this.helpKey as Parameters<typeof matchesKey>[1])) {
			this.done();
			return;
		}
		if (matchesKey(data, this.settingsKey as Parameters<typeof matchesKey>[1])) {
			this.showSettings = !this.showSettings;
			this.requestRender();
			return;
		}
		if (matchesKey(data, this.unavailableKey as Parameters<typeof matchesKey>[1])) {
			this.showUnavailable = !this.showUnavailable;
			this.requestRender();
		}
	}

	private fitCell(text: string, width: number): string {
		const clipped = truncateToWidth(text, width);
		return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
	}

	private renderTableLine(cells: string[], widths: number[]): string {
		return `│${cells.map((cell, index) => ` ${this.fitCell(cell, widths[index] ?? 1)} `).join("│")}│`;
	}

	private renderStyledRow(row: KeyHelpLayoutRow, widths: number[]): string {
		const key = this.theme.fg(row.available ? "accent" : "dim", this.fitCell(row.key, widths[0] ?? 1));
		const action = this.theme.fg(row.available ? "text" : "warning", this.fitCell(row.action, widths[1] ?? 1));
		const cells = [` ${key} `, ` ${action} `];
		if (this.showSettings) {
			cells.push(` ${this.theme.fg("dim", this.fitCell(row.setting ?? "", widths[2] ?? 1))} `);
		}
		return `│${cells.join("│")}│`;
	}

	render(width: number): string[] {
		const safeWidth = Math.max(20, width);
		const layout = createKeyHelpLayout(
			this.rows,
			safeWidth,
			this.showSettings,
			this.showUnavailable,
			visibleWidth,
		);
		const widths = layout.columns.map((column) => column.width);
		const tableWidth = widths.reduce((sum, value) => sum + value, 0) + widths.length * 3 + 1;
		const contentWidth = Math.max(1, tableWidth - 4);
		const fullRule = "─".repeat(Math.max(1, tableWidth - 2));
		const fullLine = (content: string, centered = false): string => {
			const clipped = truncateToWidth(content, contentWidth);
			const padding = Math.max(0, contentWidth - visibleWidth(clipped));
			const leftPadding = centered ? Math.floor(padding / 2) : 0;
			return `│ ${" ".repeat(leftPadding)}${clipped}${" ".repeat(padding - leftPadding)} │`;
		};
		const footer = [
			this.theme.fg("accent", formatConfiguredKey(this.settingsKey)),
			this.theme.fg("dim", ` settings:${this.showSettings ? "on" : "off"}`),
			this.theme.fg("dim", " · "),
			this.theme.fg("accent", formatConfiguredKey(this.unavailableKey)),
			this.theme.fg("dim", ` unavailable:${this.showUnavailable ? "on" : "off"}`),
			this.theme.fg("dim", " · "),
			this.theme.fg("accent", `${formatConfiguredKey(this.helpKey)}/Esc`),
			this.theme.fg("dim", " close"),
		].join("");
		return [
			`┌${fullRule}┐`,
			fullLine(this.theme.fg("accent", "anycopy keybindings")),
			createTableJunction(widths, "├", "┬", "┤"),
			this.renderTableLine(
				layout.columns.map((column) => this.theme.fg("accent", column.label)),
				widths,
			),
			createTableJunction(widths, "├", "┼", "┤"),
			...layout.rows.map((row) => this.renderStyledRow(row, widths)),
			createTableJunction(widths, "├", "┴", "┤"),
			fullLine(footer, true),
			`└${fullRule}┘`,
		];
	}

	invalidate(): void {}
}
