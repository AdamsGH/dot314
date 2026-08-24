export type ClipboardCopy = (text: string) => void | Promise<void>;

export type ClipboardCopyResult =
	| { ok: true }
	| { ok: false; error: string };

export const DEFAULT_LARGE_PAYLOAD_OSC52_MAX_BYTES = 1024 * 1024;

export type ClipboardCopyOptions = {
	largePayloadOsc52MaxBytes?: number;
	remoteSession?: boolean;
	writeOutput?: (data: string) => void;
};

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === "string" && error) return error;
	return "Unknown clipboard error";
}

const isRemoteSession = (): boolean =>
	Boolean(process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.MOSH_CONNECTION);

const emitOsc52 = (text: string, writeOutput: (data: string) => void): void => {
	writeOutput(`\u001b]52;c;${Buffer.from(text).toString("base64")}\u0007`);
};

/** Convert clipboard failures into a UI-safe result and retry bounded payloads through the remote terminal. */
export async function attemptClipboardCopy(
	text: string,
	copy: ClipboardCopy,
	options: ClipboardCopyOptions = {},
): Promise<ClipboardCopyResult> {
	try {
		await copy(text);
		return { ok: true };
	} catch (error) {
		const remoteSession = options.remoteSession ?? isRemoteSession();
		const maxBytes = options.largePayloadOsc52MaxBytes ?? 0;
		if (!remoteSession || maxBytes <= 0) {
			return { ok: false, error: getErrorMessage(error) };
		}

		const payloadBytes = Buffer.byteLength(text);
		if (payloadBytes > maxBytes) {
			return {
				ok: false,
				error: `Clipboard payload is ${payloadBytes} bytes, above the configured OSC 52 limit of ${maxBytes} bytes`,
			};
		}

		try {
			emitOsc52(text, options.writeOutput ?? ((data) => process.stdout.write(data)));
			return { ok: true };
		} catch (fallbackError) {
			return {
				ok: false,
				error: `${getErrorMessage(error)}. OSC 52 fallback failed: ${getErrorMessage(fallbackError)}`,
			};
		}
	}
}
