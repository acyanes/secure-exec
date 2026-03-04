import { afterEach, describe, expect, it } from "vitest";
import {
	PythonRuntime,
	createInMemoryFileSystem,
	createNodeDriver,
	createPyodideRuntimeDriverFactory,
} from "../../src/index.js";
import type { PythonRuntimeOptions } from "../../src/index.js";

type RuntimeOptions = Omit<
	PythonRuntimeOptions,
	"systemDriver" | "runtimeDriverFactory"
>;

describe("runtime driver specific: python", () => {
	const runtimes = new Set<PythonRuntime>();

	const createRuntime = (options: RuntimeOptions = {}): PythonRuntime => {
		const runtime = new PythonRuntime({
			...options,
			systemDriver: createNodeDriver({
				filesystem: createInMemoryFileSystem(),
			}),
			runtimeDriverFactory: createPyodideRuntimeDriverFactory(),
		});
		runtimes.add(runtime);
		return runtime;
	};

	afterEach(async () => {
		const runtimeList = Array.from(runtimes);
		runtimes.clear();

		for (const runtime of runtimeList) {
			try {
				await runtime.terminate();
			} catch {
				runtime.dispose();
			}
		}
	});

	it("returns a structured run result wrapper", async () => {
		const runtime = createRuntime();
		const result = await runtime.run("1 + 2");
		expect(result.code).toBe(0);
		expect(result.value).toBe(3);
		expect(result).not.toHaveProperty("exports");
	});

	it("keeps warm state across runs", async () => {
		const runtime = createRuntime();
		const first = await runtime.run("shared_counter = 41");
		expect(first.code).toBe(0);

		const second = await runtime.run("shared_counter + 1");
		expect(second.code).toBe(0);
		expect(second.value).toBe(42);
	});

	it("reuses system-driver permission gates for python-accessible fs hooks", async () => {
		const runtime = createRuntime();
		const result = await runtime.exec(
			'from secure_exec import read_text_file\nawait read_text_file("/tmp/secret.txt")',
		);
		expect(result.code).not.toBe(0);
		expect(result.errorMessage).toContain("EACCES");
	});

	it("fails package install pathways deterministically", async () => {
		const runtime = createRuntime();
		const result = await runtime.exec("import micropip");
		expect(result.code).toBe(1);
		expect(result.errorMessage).toContain(
			"ERR_PYTHON_PACKAGE_INSTALL_UNSUPPORTED",
		);
	});
});
