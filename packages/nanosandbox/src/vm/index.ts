import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Directory, Wasmer, Runtime } from "@wasmer/sdk/node";

export interface VirtualMachineOptions {
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	memoryLimit?: number;
	/** Input to pass to the command's stdin */
	stdin?: string;
}

interface HostExecContext {
	command: string;
	args: string[];
	env: Record<string, string>;
	cwd: string;
	stdin: ReadableStream<Uint8Array> | null;
	stdout: WritableStream<Uint8Array> | null;
	stderr: WritableStream<Uint8Array> | null;
	// Streaming callbacks for output
	onStdout?: (data: Uint8Array) => void;
	onStderr?: (data: Uint8Array) => void;
	// Stdin write callbacks - set by handler, called by scheduler
	setStdinWriter?: (writer: (data: Uint8Array) => void, closer: () => void) => void;
}

const DATA_MOUNT_PATH = "/data";

let runtimePackage: Awaited<ReturnType<typeof Wasmer.fromFile>> | null = null;
let wasmerRuntime: Runtime | null = null;

/**
 * Handle host_exec syscalls from WASM.
 * Executes the requested command and returns the exit code.
 * Streams stdout/stderr via the onStdout/onStderr callbacks.
 */
async function hostExecHandler(ctx: HostExecContext): Promise<number> {
	console.error(`[host_exec] command=${ctx.command} args=${JSON.stringify(ctx.args)}`);

	return new Promise((resolve) => {
		// Merge WASM environment with parent process environment
		// Parent env provides PATH and other system variables
		const mergedEnv = { ...process.env, ...ctx.env };

		const child = spawn(ctx.command, ctx.args, {
			env: mergedEnv,
			cwd: ctx.cwd !== "/" ? ctx.cwd : undefined,
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Register stdin writer if setStdinWriter is available
		if (ctx.setStdinWriter && child.stdin) {
			const childStdin = child.stdin;
			ctx.setStdinWriter(
				// Writer function
				(data: Uint8Array) => {
					childStdin.write(Buffer.from(data));
				},
				// Closer function
				() => {
					childStdin.end();
				}
			);
		}

		// Stream stdout via callback
		child.stdout?.on("data", (data: Buffer) => {
			if (ctx.onStdout) {
				ctx.onStdout(new Uint8Array(data));
			}
		});

		// Stream stderr via callback
		child.stderr?.on("data", (data: Buffer) => {
			if (ctx.onStderr) {
				ctx.onStderr(new Uint8Array(data));
			}
		});

		child.on("close", (code) => {
			console.error(`[host_exec] process exited with code: ${code}`);
			resolve(code ?? 0);
		});

		child.on("error", (err) => {
			console.error(`[host_exec] spawn error: ${err.message}`);
			resolve(1);
		});
	});
}

async function loadRuntimePackage(): Promise<Awaited<ReturnType<typeof Wasmer.fromFile>>> {
	if (!runtimePackage) {
		// Create runtime and set host_exec handler
		wasmerRuntime = new Runtime();
		wasmerRuntime.setHostExecHandler(hostExecHandler);

		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const webcPath = path.resolve(currentDir, "../../assets/runtime.webc");
		const webcBytes = await fs.readFile(webcPath);
		runtimePackage = await Wasmer.fromFile(webcBytes, wasmerRuntime);
	}
	return runtimePackage;
}

/**
 * VirtualMachine represents the result of running a command.
 */
export class VirtualMachine {
	public stdout = "";
	public stderr = "";
	public code = 0;

	private command: string;
	private options: VirtualMachineOptions;

	constructor(command: string, options: VirtualMachineOptions = {}) {
		this.command = command;
		this.options = options;
	}

	/**
	 * Execute the command. Called by Runtime.run().
	 */
	async setup(): Promise<void> {
		const pkg = await loadRuntimePackage();

		const cmd = pkg.commands[this.command];
		if (!cmd) {
			throw new Error(`Command not found: ${this.command}`);
		}

		const { args = [], env, cwd, stdin } = this.options;

		const directory = new Directory();

		const instance = await cmd.run({
			args,
			env,
			cwd,
			stdin,
			mount: {
				[DATA_MOUNT_PATH]: directory,
			},
		});

		const result = await instance.wait();

		this.stdout = result.stdout;
		this.stderr = result.stderr;
		this.code = result.code ?? 0;
	}
}
