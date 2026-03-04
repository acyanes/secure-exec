import { afterEach, expect, it } from "vitest";

type StdioEvent = {
	channel: "stdout" | "stderr";
	message: string;
};

type RuntimeLike = {
	exec(
		code: string,
		options?: {
			cpuTimeLimitMs?: number;
			onStdio?: (event: StdioEvent) => void;
		},
	): Promise<{ code: number; errorMessage?: string }>;
	dispose(): void;
	terminate(): Promise<void>;
};

type RuntimeOptions = {
	cpuTimeLimitMs?: number;
	onStdio?: (event: StdioEvent) => void;
};

export type PythonSuiteContext = {
	createNodeRuntime(options?: RuntimeOptions): Promise<RuntimeLike>;
	createPythonRuntime(options?: RuntimeOptions): Promise<RuntimeLike>;
	teardown(): Promise<void>;
};

export function runExecParitySuite(context: PythonSuiteContext): void {
	afterEach(async () => {
		await context.teardown();
	});

	it("returns the same base exec success contract", async () => {
		const [node, python] = await Promise.all([
			context.createNodeRuntime(),
			context.createPythonRuntime(),
		]);

		const [nodeResult, pythonResult] = await Promise.all([
			node.exec(`console.log("ok")`),
			python.exec(`print("ok")`),
		]);

		expect(nodeResult.code).toBe(0);
		expect(pythonResult.code).toBe(0);
		expect(nodeResult.errorMessage).toBeUndefined();
		expect(pythonResult.errorMessage).toBeUndefined();
		expect(nodeResult).not.toHaveProperty("stdout");
		expect(pythonResult).not.toHaveProperty("stdout");
	});

	it("returns the same base exec timeout contract", async () => {
		const [node, python] = await Promise.all([
			context.createNodeRuntime({ cpuTimeLimitMs: 60 }),
			context.createPythonRuntime({ cpuTimeLimitMs: 60 }),
		]);

		const [nodeResult, pythonResult] = await Promise.all([
			node.exec(`while (true) {}`),
			python.exec("while True:\n  pass"),
		]);

		expect(nodeResult.code).toBe(124);
		expect(pythonResult.code).toBe(124);
		expect(nodeResult.errorMessage).toContain("CPU time limit exceeded");
		expect(pythonResult.errorMessage).toContain("CPU time limit exceeded");
	});
}

export function runPythonExecSuite(context: PythonSuiteContext): void {
	afterEach(async () => {
		await context.teardown();
	});

	it("returns success for valid python exec", async () => {
		const runtime = await context.createPythonRuntime();
		const events: string[] = [];
		const result = await runtime.exec('print("python-suite-ok")', {
			onStdio: (event) => events.push(`${event.channel}:${event.message}`),
		});
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(events.join("\n")).toContain("python-suite-ok");
	});

	it("returns deterministic error contract for python exceptions", async () => {
		const runtime = await context.createPythonRuntime();
		const result = await runtime.exec('raise Exception("boom")');
		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain("boom");
	});

	it("maps cpu timeouts to the shared timeout contract", async () => {
		const runtime = await context.createPythonRuntime({ cpuTimeLimitMs: 50 });
		const result = await runtime.exec("while True:\n  pass");
		expect(result.code).toBe(124);
		expect(result.errorMessage).toContain("CPU time limit exceeded");
	});

	it("does not retain unbounded stdout/stderr buffers in exec results", async () => {
		const runtime = await context.createPythonRuntime();
		const events: string[] = [];
		const result = await runtime.exec(
			'for i in range(2500):\n  print("line-" + str(i))',
			{
				onStdio: (event) => {
					events.push(event.message);
				},
			},
		);
		expect(result.code).toBe(0);
		expect(events.length).toBeGreaterThan(0);
		expect(result).not.toHaveProperty("stdout");
		expect(result).not.toHaveProperty("stderr");
	});

	it("recovers after timeout and can execute again", async () => {
		const runtime = await context.createPythonRuntime({ cpuTimeLimitMs: 40 });
		const timedOut = await runtime.exec("while True:\n  pass");
		expect(timedOut.code).toBe(124);

		const recovered = await runtime.exec('print("recovered")');
		expect(recovered.code).toBe(0);
	});
}
