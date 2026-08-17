export type ClipboardCopy = (text: string) => void | Promise<void>;

export type ClipboardCopyResult =
	| { ok: true }
	| { ok: false; error: string };

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return "Unknown clipboard error";
}

/** Convert synchronous throws and rejected clipboard promises into a UI-safe result. */
export async function attemptClipboardCopy(
	text: string,
	copy: ClipboardCopy,
): Promise<ClipboardCopyResult> {
	try {
		await copy(text);
		return { ok: true };
	} catch (error) {
		return { ok: false, error: getErrorMessage(error) };
	}
}
