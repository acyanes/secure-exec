// process polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js process object emulation

import { Buffer } from "buffer";

// Configuration interface for customization
export interface ProcessConfig {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  version?: string;
  cwd?: string;
  env?: Record<string, string>;
  argv?: string[];
  execPath?: string;
}

// Declare globals that are set up by the host environment
declare const _log: { applySync: (ctx: undefined, args: [string]) => void } | undefined;
declare const _error: { applySync: (ctx: undefined, args: [string]) => void } | undefined;
declare const _processConfig: ProcessConfig | undefined;

// Default configuration
const config: Required<ProcessConfig> = {
  platform: "linux",
  arch: "x64",
  version: "v22.0.0",
  cwd: "/",
  env: {},
  argv: ["node", "script.js"],
  execPath: "/usr/bin/node",
};

// Apply host configuration if provided
if (typeof _processConfig !== "undefined") {
  Object.assign(config, _processConfig);
}

// Start time for uptime calculation
const processStartTime = Date.now();

// Exit code tracking
let exitCode = 0;

// ProcessExitError class for controlled exits
class ProcessExitError extends Error {
  code: number;
  constructor(code: number) {
    super("process.exit(" + code + ")");
    this.name = "ProcessExitError";
    this.code = code;
  }
}

// Make ProcessExitError available globally
(globalThis as unknown as { ProcessExitError: typeof ProcessExitError }).ProcessExitError = ProcessExitError;

// Event listener types
type EventListener = (...args: unknown[]) => void;

// Event emitter state
const processListeners: Record<string, EventListener[]> = {};
const processOnceListeners: Record<string, EventListener[]> = {};

function addListener(event: string, listener: EventListener, once = false): typeof process {
  const target = once ? processOnceListeners : processListeners;
  if (!target[event]) {
    target[event] = [];
  }
  target[event].push(listener);
  return process;
}

function removeListener(event: string, listener: EventListener): typeof process {
  if (processListeners[event]) {
    const idx = processListeners[event].indexOf(listener);
    if (idx !== -1) processListeners[event].splice(idx, 1);
  }
  if (processOnceListeners[event]) {
    const idx = processOnceListeners[event].indexOf(listener);
    if (idx !== -1) processOnceListeners[event].splice(idx, 1);
  }
  return process;
}

function emit(event: string, ...args: unknown[]): boolean {
  let handled = false;

  // Regular listeners
  if (processListeners[event]) {
    for (const listener of processListeners[event]) {
      listener(...args);
      handled = true;
    }
  }

  // Once listeners (remove after calling)
  if (processOnceListeners[event]) {
    const listeners = processOnceListeners[event].slice();
    processOnceListeners[event] = [];
    for (const listener of listeners) {
      listener(...args);
      handled = true;
    }
  }

  return handled;
}

// Stdout stream type
interface StdoutStream {
  write(data: string | Uint8Array): boolean;
  end(): StdoutStream;
  on(): StdoutStream;
  once(): StdoutStream;
  emit(): boolean;
  writable: boolean;
  isTTY: boolean;
  columns: number;
  rows: number;
}

// Stdout stream (captures to result.stdout)
const stdout: StdoutStream = {
  write(data: string | Uint8Array): boolean {
    if (typeof _log !== "undefined") {
      _log.applySync(undefined, [String(data).replace(/\n$/, "")]);
    }
    return true;
  },
  end(): StdoutStream {
    return this;
  },
  on(): StdoutStream {
    return this;
  },
  once(): StdoutStream {
    return this;
  },
  emit(): boolean {
    return false;
  },
  writable: true,
  isTTY: false,
  columns: 80,
  rows: 24,
};

// Stderr stream (captures to result.stderr)
const stderr: StdoutStream = {
  write(data: string | Uint8Array): boolean {
    if (typeof _error !== "undefined") {
      _error.applySync(undefined, [String(data).replace(/\n$/, "")]);
    }
    return true;
  },
  end(): StdoutStream {
    return this;
  },
  on(): StdoutStream {
    return this;
  },
  once(): StdoutStream {
    return this;
  },
  emit(): boolean {
    return false;
  },
  writable: true,
  isTTY: false,
  columns: 80,
  rows: 24,
};

// Stdin stream type
interface StdinStream {
  readable: boolean;
  paused: boolean;
  encoding: BufferEncoding | null;
  read(): null;
  on(): StdinStream;
  once(): StdinStream;
  emit(): boolean;
  pause(): StdinStream;
  resume(): StdinStream;
  setEncoding(enc: BufferEncoding): StdinStream;
  isTTY: boolean;
}

// Stdin stream (read-only, paused)
const stdin: StdinStream = {
  readable: true,
  paused: true,
  encoding: null as BufferEncoding | null,
  read(): null {
    return null;
  },
  on(): StdinStream {
    return this;
  },
  once(): StdinStream {
    return this;
  },
  emit(): boolean {
    return false;
  },
  pause(): StdinStream {
    this.paused = true;
    return this;
  },
  resume(): StdinStream {
    this.paused = false;
    return this;
  },
  setEncoding(enc: BufferEncoding): StdinStream {
    this.encoding = enc;
    return this;
  },
  isTTY: false,
};

// Current working directory state
let currentCwd = config.cwd;

// Umask state
let currentUmask = 0o022;

// Process type interface to avoid circular reference with typeof
interface ProcessType {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  version: string;
  versions: Record<string, string>;
  pid: number;
  ppid: number;
  execPath: string;
  execArgv: string[];
  argv: string[];
  argv0: string;
  title: string;
  env: Record<string, string>;
  config: Record<string, unknown>;
  release: Record<string, string>;
  features: Record<string, boolean>;
  cwd(): string;
  chdir(dir: string): void;
  exitCode: number;
  exit(code?: number): never;
  abort(): never;
  nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void;
  hrtime: typeof hrtime;
  getuid(): number;
  getgid(): number;
  geteuid(): number;
  getegid(): number;
  getgroups(): number[];
  setuid(): void;
  setgid(): void;
  seteuid(): void;
  setegid(): void;
  setgroups(): void;
  umask(mask?: number): number;
  uptime(): number;
  memoryUsage(): NodeJS.MemoryUsage;
  cpuUsage(prev?: NodeJS.CpuUsage): NodeJS.CpuUsage;
  resourceUsage(): NodeJS.ResourceUsage;
  kill(pid: number, signal?: NodeJS.Signals | number): true;
  on(event: string, listener: EventListener): ProcessType;
  once(event: string, listener: EventListener): ProcessType;
  off(event: string, listener: EventListener): ProcessType;
  removeListener(event: string, listener: EventListener): ProcessType;
  removeAllListeners(event?: string): ProcessType;
  addListener(event: string, listener: EventListener): ProcessType;
  emit(event: string, ...args: unknown[]): boolean;
  listeners(event: string): Function[];
  listenerCount(event: string): number;
  prependListener(event: string, listener: EventListener): ProcessType;
  prependOnceListener(event: string, listener: EventListener): ProcessType;
  eventNames(): (string | symbol)[];
  setMaxListeners(): ProcessType;
  getMaxListeners(): number;
  rawListeners(event: string): Function[];
  stdout: StdoutStream;
  stderr: StdoutStream;
  stdin: StdinStream;
  connected: boolean;
  mainModule: NodeJS.Module | undefined;
  emitWarning(warning: string | Error, options?: string | { type?: string; code?: string; ctor?: Function }): void;
  binding(name: string): Record<string, unknown>;
  _linkedBinding(name: string): Record<string, unknown>;
  dlopen(): never;
  hasUncaughtExceptionCaptureCallback(): boolean;
  setUncaughtExceptionCaptureCallback(): void;
  send(): boolean;
  disconnect(): void;
  report: Record<string, unknown>;
  debugPort: number;
}

// hrtime function with bigint support
function hrtime(prev?: [number, number]): [number, number] {
  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  const seconds = Math.floor(now / 1000);
  const nanoseconds = Math.floor((now % 1000) * 1e6);

  if (prev) {
    let diffSec = seconds - prev[0];
    let diffNano = nanoseconds - prev[1];
    if (diffNano < 0) {
      diffSec -= 1;
      diffNano += 1e9;
    }
    return [diffSec, diffNano];
  }

  return [seconds, nanoseconds];
}

hrtime.bigint = function (): bigint {
  const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  return BigInt(Math.floor(now * 1e6));
};

// Helper function for process.binding
function getBinding(name: string): Record<string, unknown> {
  const stubs: Record<string, Record<string, unknown>> = {
    fs: {},
    buffer: { Buffer: Buffer },
    process_wrap: {},
    natives: {},
    config: {},
    uv: { UV_UDP_REUSEADDR: 4 },
    constants: {},
    crypto: {},
    string_decoder: {},
    os: {},
  };
  return stubs[name] || {};
}

// The process object
const process: ProcessType = {
  // Static properties
  platform: config.platform,
  arch: config.arch,
  version: config.version,
  versions: {
    node: config.version.replace(/^v/, ""),
    v8: "11.3.244.8",
    uv: "1.44.2",
    zlib: "1.2.13",
    brotli: "1.0.9",
    ares: "1.19.0",
    modules: "108",
    nghttp2: "1.52.0",
    napi: "8",
    llhttp: "8.1.0",
    openssl: "3.0.8",
    cldr: "42.0",
    icu: "72.1",
    tz: "2022g",
    unicode: "15.0",
  },
  pid: 1,
  ppid: 0,
  execPath: config.execPath,
  execArgv: [] as string[],
  argv: config.argv,
  argv0: config.argv[0] || "node",
  title: "node",
  env: config.env,

  // Config stubs
  config: {
    target_defaults: {
      cflags: [] as string[],
      default_configuration: "Release",
      defines: [] as string[],
      include_dirs: [] as string[],
      libraries: [] as string[],
    },
    variables: {
      node_prefix: "/usr",
      node_shared_libuv: false,
    },
  },

  release: {
    name: "node",
    sourceUrl: "https://nodejs.org/download/release/v20.0.0/node-v20.0.0.tar.gz",
    headersUrl: "https://nodejs.org/download/release/v20.0.0/node-v20.0.0-headers.tar.gz",
  },

  // Feature flags
  features: {
    inspector: false,
    debug: false,
    uv: true,
    ipv6: true,
    tls_alpn: true,
    tls_sni: true,
    tls_ocsp: true,
    tls: true,
  },

  // Methods
  cwd(): string {
    return currentCwd;
  },

  chdir(dir: string): void {
    currentCwd = dir;
  },

  get exitCode(): number {
    return exitCode;
  },

  set exitCode(code: number) {
    exitCode = code;
  },

  exit(code?: number): never {
    const finalCode = code !== undefined ? code : exitCode;
    exitCode = finalCode;

    // Fire exit event
    try {
      emit("exit", finalCode);
    } catch {
      // Ignore errors in exit handlers
    }

    // Throw to stop execution
    throw new ProcessExitError(finalCode);
  },

  abort(): never {
    exitCode = 1;
    try {
      emit("exit", 1);
    } catch {
      // Ignore errors in exit handlers
    }
    throw new ProcessExitError(1);
  },

  nextTick(callback: (...args: unknown[]) => void, ...args: unknown[]): void {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => callback(...args));
    } else {
      Promise.resolve().then(() => callback(...args));
    }
  },

  hrtime,

  getuid(): number {
    return 0;
  },
  getgid(): number {
    return 0;
  },
  geteuid(): number {
    return 0;
  },
  getegid(): number {
    return 0;
  },
  getgroups(): number[] {
    return [0];
  },

  setuid(): void {},
  setgid(): void {},
  seteuid(): void {},
  setegid(): void {},
  setgroups(): void {},

  umask(mask?: number): number {
    const oldMask = currentUmask;
    if (mask !== undefined) {
      currentUmask = mask;
    }
    return oldMask;
  },

  uptime(): number {
    return (Date.now() - processStartTime) / 1000;
  },

  memoryUsage(): NodeJS.MemoryUsage {
    return {
      rss: 50 * 1024 * 1024,
      heapTotal: 20 * 1024 * 1024,
      heapUsed: 10 * 1024 * 1024,
      external: 1 * 1024 * 1024,
      arrayBuffers: 500 * 1024,
    };
  },

  cpuUsage(prev?: NodeJS.CpuUsage): NodeJS.CpuUsage {
    const usage = {
      user: 1000000,
      system: 500000,
    };

    if (prev) {
      return {
        user: usage.user - prev.user,
        system: usage.system - prev.system,
      };
    }

    return usage;
  },

  resourceUsage(): NodeJS.ResourceUsage {
    return {
      userCPUTime: 1000000,
      systemCPUTime: 500000,
      maxRSS: 50 * 1024,
      sharedMemorySize: 0,
      unsharedDataSize: 0,
      unsharedStackSize: 0,
      minorPageFault: 0,
      majorPageFault: 0,
      swappedOut: 0,
      fsRead: 0,
      fsWrite: 0,
      ipcSent: 0,
      ipcReceived: 0,
      signalsCount: 0,
      voluntaryContextSwitches: 0,
      involuntaryContextSwitches: 0,
    };
  },

  kill(pid: number, signal?: NodeJS.Signals | number): true {
    const processPid = 1; // process.pid is always 1
    if (pid !== processPid) {
      const err = new Error("Operation not permitted") as Error & {
        code: string;
        errno: number;
        syscall: string;
      };
      err.code = "EPERM";
      err.errno = -1;
      err.syscall = "kill";
      throw err;
    }
    // Self-kill - treat as exit
    if (!signal || signal === "SIGTERM" || signal === 15) {
      exitCode = 143;
      throw new ProcessExitError(143);
    }
    return true;
  },

  // EventEmitter methods
  on(event: string, listener: EventListener): ProcessType {
    addListener(event, listener);
    return process;
  },

  once(event: string, listener: EventListener): ProcessType {
    addListener(event, listener, true);
    return process;
  },

  off(event: string, listener: EventListener): ProcessType {
    removeListener(event, listener);
    return process;
  },

  removeListener(event: string, listener: EventListener): ProcessType {
    removeListener(event, listener);
    return process;
  },

  removeAllListeners(event?: string): ProcessType {
    if (event) {
      delete processListeners[event];
      delete processOnceListeners[event];
    } else {
      Object.keys(processListeners).forEach((k) => delete processListeners[k]);
      Object.keys(processOnceListeners).forEach((k) => delete processOnceListeners[k]);
    }
    return process;
  },

  addListener(event: string, listener: EventListener): ProcessType {
    addListener(event, listener);
    return process;
  },

  emit(event: string, ...args: unknown[]): boolean {
    return emit(event, ...args);
  },

  listeners(event: string): Function[] {
    return [...(processListeners[event] || []), ...(processOnceListeners[event] || [])];
  },

  listenerCount(event: string): number {
    return (processListeners[event] || []).length + (processOnceListeners[event] || []).length;
  },

  prependListener(event: string, listener: EventListener): ProcessType {
    if (!processListeners[event]) {
      processListeners[event] = [];
    }
    processListeners[event].unshift(listener);
    return process;
  },

  prependOnceListener(event: string, listener: EventListener): ProcessType {
    if (!processOnceListeners[event]) {
      processOnceListeners[event] = [];
    }
    processOnceListeners[event].unshift(listener);
    return process;
  },

  eventNames(): (string | symbol)[] {
    return [...new Set([...Object.keys(processListeners), ...Object.keys(processOnceListeners)])];
  },

  setMaxListeners(): ProcessType {
    return process;
  },
  getMaxListeners(): number {
    return 10;
  },
  rawListeners(event: string): Function[] {
    return [...(processListeners[event] || []), ...(processOnceListeners[event] || [])];
  },

  // Stdio streams
  stdout,
  stderr,
  stdin,

  // Process state
  connected: false,

  // Module info (will be set by createRequire)
  mainModule: undefined as NodeJS.Module | undefined,

  // No-op methods for compatibility
  emitWarning(warning: string | Error, _options?: string | { type?: string; code?: string; ctor?: Function }): void {
    const msg = typeof warning === "string" ? warning : warning.message;
    emit("warning", { message: msg, name: "Warning" });
  },

  binding(name: string): Record<string, unknown> {
    return getBinding(name);
  },

  _linkedBinding(name: string): Record<string, unknown> {
    return getBinding(name);
  },

  dlopen(): never {
    throw new Error("process.dlopen is not supported");
  },

  hasUncaughtExceptionCaptureCallback(): boolean {
    return false;
  },
  setUncaughtExceptionCaptureCallback(): void {},

  // Send for IPC (no-op)
  send(): boolean {
    return false;
  },
  disconnect(): void {},

  // Report
  report: {
    directory: "",
    filename: "",
    compact: false,
    signal: "SIGUSR2" as NodeJS.Signals,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport(): object {
      return {};
    },
    writeReport(): string {
      return "";
    },
  },

  // Debug port
  debugPort: 9229,
};

// Export process and related utilities
export { ProcessExitError };
export default process;
