import { describe, expect, it, beforeAll } from "vitest";
import { Runtime } from "../src/runtime/index.js";

/**
 * Tests for WASIX subprocess spawning node via shell scripts.
 *
 * This tests the path: runtime.run -> bash -c -> node -e
 *
 * This verifies that WASIX can spawn node as a subprocess through shell
 * scripts, with proper argument passing, variable interpolation, and
 * exit code propagation.
 */
describe("WASIX Host Exec Node", () => {
	let runtime: Runtime;

	beforeAll(async () => {
		runtime = await Runtime.load();
	});

	it("should execute node -e through bash -c", async () => {
		const vm = await runtime.run("bash", {
			args: ["-c", "node -e \"console.log('hello from node')\""],
		});
		expect(vm.stdout).toContain("hello from node");
		expect(vm.code).toBe(0);
	}, 30000);

	it("should pass bash positional params to node", async () => {
		// bash -c 'script' _ arg1 arg2 sets $1=arg1, $2=arg2
		const vm = await runtime.run("bash", {
			args: ["-c", "node -e \"console.log('arg:', '$1')\"", "_", "myarg"],
		});
		expect(vm.stdout).toContain("arg: myarg");
		expect(vm.code).toBe(0);
	}, 30000);

	it("should use shell variable in node command", async () => {
		const vm = await runtime.run("bash", {
			args: ["-c", "MSG=hello; node -e \"console.log('$MSG')\""],
		});
		expect(vm.stdout).toContain("hello");
		expect(vm.code).toBe(0);
	}, 30000);

	it("should propagate node exit code through shell", async () => {
		const vm = await runtime.run("bash", {
			args: ["-c", "node -e \"process.exit(42)\""],
		});
		expect(vm.code).toBe(42);
	}, 30000);

	it("should capture node output in shell variable", async () => {
		const vm = await runtime.run("bash", {
			args: ["-c", "OUT=$(node -e \"console.log(123)\"); echo \"got:$OUT\""],
		});
		expect(vm.stdout).toContain("got:123");
		expect(vm.code).toBe(0);
	}, 30000);

	it("should run multiple node commands in sequence", async () => {
		const vm = await runtime.run("bash", {
			args: ["-c", "node -e \"console.log('first')\"; node -e \"console.log('second')\""],
		});
		expect(vm.stdout).toContain("first");
		expect(vm.stdout).toContain("second");
		expect(vm.code).toBe(0);
	}, 30000);
});
