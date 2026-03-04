// Browser-safe entrypoint for NodeRuntime + browser driver factories.
export { NodeRuntime } from "./runtime.js";
export type { NodeRuntimeOptions } from "./runtime.js";

export {
	createBrowserDriver,
	createBrowserNetworkAdapter,
	createBrowserRuntimeDriverFactory,
	createOpfsFileSystem,
} from "./browser/index.js";
export type {
	BrowserDriverOptions,
	BrowserRuntimeDriverFactoryOptions,
	BrowserRuntimeSystemOptions,
} from "./browser/index.js";

export type {
	StdioChannel,
	StdioEvent,
	StdioHook,
	ExecOptions,
	ExecResult,
	OSConfig,
	PythonRunResult,
	ProcessConfig,
	RunResult,
	TimingMitigation,
} from "./shared/api-types.js";

export {
	allowAll,
	allowAllChildProcess,
	allowAllEnv,
	allowAllFs,
	allowAllNetwork,
} from "./shared/permissions.js";
