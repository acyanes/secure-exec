import { Runtime, Process } from "nanosandbox";

export interface TerminalOptions {
	/** Path to load files from host filesystem */
	hostPath?: string;
	/** Command to run (default: bash) */
	command?: string;
	/** Arguments to pass to the command */
	args?: string[];
	/** Enable debug output */
	debug?: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Connect terminal streams to spawned process
 */
function connectStreams(proc: Process): void {
	// Set up stdin from process.stdin
	if (process.stdin.isTTY) {
		// Enable raw mode for character-by-character input
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		process.stdin.on("data", async (data: string) => {
			// Handle Ctrl+C
			if (data === "\x03") {
				console.log("\n^C");
				proc.kill();
				process.exit(0);
			}
			// Handle Ctrl+D (EOF)
			if (data === "\x04") {
				await proc.closeStdin();
				return;
			}
			await proc.writeStdin(data);
		});
	} else {
		// Non-TTY mode (piped input)
		process.stdin.on("data", async (chunk: Buffer) => {
			await proc.writeStdin(chunk.toString());
		});
		process.stdin.on("end", async () => {
			await proc.closeStdin();
		});
	}

	// Poll stdout in background
	(async () => {
		while (true) {
			try {
				const output = await proc.readStdout();
				if (output) {
					// Convert \n to \r\n for proper terminal display
					process.stdout.write(output.replace(/\n/g, "\r\n"));
				}
				await new Promise(r => setTimeout(r, 10));
			} catch {
				break;
			}
		}
	})();
}

/**
 * Start an interactive terminal session
 */
export async function startTerminal(
	options: TerminalOptions = {},
): Promise<number> {
	const debug = options.debug ?? false;
	const startTime = Date.now();
	const logTiming = (step: string) => {
		if (debug) {
			console.error(`[terminal] ${step} (${Date.now() - startTime}ms)`);
		}
	};

	// Load runtime
	logTiming("Loading runtime...");
	const runtime = await Runtime.load();
	logTiming("Runtime loaded");

	// Get the command to run
	const commandName = options.command ?? "bash";
	const commandArgs = options.args ?? [];
	logTiming(`Spawning '${commandName} ${commandArgs.join(" ")}'...`);

	// Spawn interactive process
	const proc = await runtime.spawn(commandName, { args: commandArgs });
	logTiming("Process spawned");

	// Connect streams
	logTiming("Connecting streams...");
	connectStreams(proc);
	logTiming("Streams connected - terminal ready");

	// Wait for the command to complete
	const result = await proc.wait();
	logTiming("Command completed");

	// Restore terminal settings
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}

	return result.code;
}

export { Runtime };
