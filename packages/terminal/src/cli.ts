#!/usr/bin/env node

import { startTerminal } from "./index.js";

async function main() {
	const argv = process.argv.slice(2);

	let hostPath: string | undefined;
	let debug = false;
	const positionalArgs: string[] = [];

	// Parse arguments
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--path" || arg === "-p") {
			hostPath = argv[++i];
		} else if (arg === "--debug" || arg === "-d") {
			debug = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
nanosandbox - Interactive terminal for nanosandbox VM

Usage: nanosandbox [options] [command] [...args]

Options:
  -p, --path <dir>     Load files from host directory into VM
  -d, --debug          Enable debug output
  -h, --help           Show this help message

Examples:
  nanosandbox                              # Start bash shell
  nanosandbox -p ./project                 # Start with project files loaded
  nanosandbox sh                           # Start sh instead of bash
  nanosandbox bash -c "echo hello"         # Run a command
  nanosandbox node -e "console.log('hi')"  # Run node
`);
			process.exit(0);
		} else if (arg === "--") {
			// Everything after -- is positional
			positionalArgs.push(...argv.slice(i + 1));
			break;
		} else if (arg.startsWith("-")) {
			console.error(`Unknown option: ${arg}`);
			process.exit(1);
		} else {
			// First positional arg and everything after
			positionalArgs.push(...argv.slice(i));
			break;
		}
	}

	const command = positionalArgs[0];
	const args = positionalArgs.slice(1);

	try {
		console.log("Starting nanosandbox terminal...");
		console.log("Press Ctrl+C to exit, Ctrl+D to send EOF\n");

		const exitCode = await startTerminal({
			hostPath,
			command,
			args,
			debug,
		});

		process.exit(exitCode);
	} catch (error) {
		console.error("Error:", error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
