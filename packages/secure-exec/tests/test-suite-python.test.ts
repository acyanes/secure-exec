import { describe } from "vitest";
import { allowAll } from "../src/browser-runtime.js";
import {
	runExecParitySuite,
	runPythonExecSuite,
	type PythonSuiteContext,
} from "./test-suite/python.js";

type DisposableRuntime = {
	dispose(): void;
	terminate(): Promise<void>;
};

function isNodeTargetAvailable(): boolean {
	return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function createPythonSuiteContext(): PythonSuiteContext {
	const runtimes = new Set<DisposableRuntime>();

	return {
		async teardown(): Promise<void> {
			const runtimeList = Array.from(runtimes);
			runtimes.clear();

			for (const runtime of runtimeList) {
				try {
					await runtime.terminate();
				} catch {
					runtime.dispose();
				}
			}
		},
		async createNodeRuntime(options = {}) {
			const {
				NodeRuntime: NodeRuntimeClass,
				createNodeDriver,
				createNodeRuntimeDriverFactory,
			} = await import("../src/index.js");
			const runtime = new NodeRuntimeClass({
				...options,
				systemDriver: createNodeDriver({
					useDefaultNetwork: true,
					permissions: allowAll,
				}),
				runtimeDriverFactory: createNodeRuntimeDriverFactory(),
			});
			runtimes.add(runtime);
			return runtime;
		},
		async createPythonRuntime(options = {}) {
			const {
				PythonRuntime: PythonRuntimeClass,
				createNodeDriver,
				createPyodideRuntimeDriverFactory,
			} = await import("../src/index.js");
			const runtime = new PythonRuntimeClass({
				...options,
				systemDriver: createNodeDriver({
					useDefaultNetwork: true,
					permissions: allowAll,
				}),
				runtimeDriverFactory: createPyodideRuntimeDriverFactory(),
			});
			runtimes.add(runtime);
			return runtime;
		},
	};
}

describe.skipIf(!isNodeTargetAvailable())("python runtime integration suite", () => {
	const context = createPythonSuiteContext();
	runExecParitySuite(context);
	runPythonExecSuite(context);
});
