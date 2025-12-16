// child_process polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js child_process API compatibility

import { Buffer } from "buffer";
import type * as nodeChildProcess from "child_process";
import type { Readable } from "stream";

// Declare globals that are set up by the host environment
declare const _childProcessExecRaw: {
  apply: (ctx: undefined, args: [string], options: { result: { promise: true } }) => Promise<string>;
  applySyncPromise: (ctx: undefined, args: [string]) => string;
};
declare const _childProcessSpawnRaw: {
  apply: (ctx: undefined, args: [string, string], options: { result: { promise: true } }) => Promise<string>;
  applySyncPromise: (ctx: undefined, args: [string, string]) => string;
};

// Event listener types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventListener = (...args: any[]) => void;

// Simplified stream interface for stdout/stderr
interface OutputStreamLike {
  readable: boolean;
  _data: string;
  _listeners: Record<string, EventListener[]>;
  _onceListeners: Record<string, EventListener[]>;
  on(event: string, listener: EventListener): OutputStreamLike;
  once(event: string, listener: EventListener): OutputStreamLike;
  emit(event: string, ...args: unknown[]): boolean;
  read(): null;
  setEncoding(encoding: BufferEncoding): OutputStreamLike;
  pipe<T>(dest: T): T;
}

// Stdin stream class
class StdinStreamImpl {
  writable = true;
  _buffer: unknown[] = [];

  write(data: unknown): boolean {
    this._buffer.push(data);
    return true;
  }
  end(): this {
    this.writable = false;
    return this;
  }
  on(): this { return this; }
  once(): this { return this; }
  emit(): boolean { return false; }
  cork(): void {}
  uncork(): void {}
  setDefaultEncoding(): this { return this; }
  destroy(): this { return this; }
  destroyed = false;
  writableEnded = false;
  writableFinished = false;
  writableHighWaterMark = 16384;
  writableLength = 0;
  writableObjectMode = false;
  writableCorked = 0;
  writableNeedDrain = false;
  closed = false;
  errored: Error | null = null;
  _write(): void {}
  _destroy(): void {}
  _final(): void {}
  addListener(): this { return this; }
  removeListener(): this { return this; }
  off(): this { return this; }
  removeAllListeners(): this { return this; }
  setMaxListeners(): this { return this; }
  getMaxListeners(): number { return 10; }
  listeners(): Function[] { return []; }
  rawListeners(): Function[] { return []; }
  listenerCount(): number { return 0; }
  prependListener(): this { return this; }
  prependOnceListener(): this { return this; }
  eventNames(): (string | symbol)[] { return []; }
  pipe<T>(_dest: T): T { return _dest; }
  unpipe(): this { return this; }
}

// Create stdin stream
function createStdin(): StdinStreamImpl {
  return new StdinStreamImpl();
}

// Create stdout/stderr stream
function createOutputStream(): OutputStreamLike {
  const stream: OutputStreamLike = {
    readable: true,
    _data: "",
    _listeners: {},
    _onceListeners: {},
    on(event: string, listener: EventListener): OutputStreamLike {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(listener);
      return this;
    },
    once(event: string, listener: EventListener): OutputStreamLike {
      if (!this._onceListeners[event]) this._onceListeners[event] = [];
      this._onceListeners[event].push(listener);
      return this;
    },
    emit(event: string, ...args: unknown[]): boolean {
      if (this._listeners[event]) {
        this._listeners[event].forEach((fn) => fn(...args));
      }
      if (this._onceListeners[event]) {
        this._onceListeners[event].forEach((fn) => fn(...args));
        this._onceListeners[event] = [];
      }
      return true;
    },
    read(): null {
      return null;
    },
    setEncoding(): OutputStreamLike {
      return this;
    },
    pipe<T>(dest: T): T {
      return dest;
    },
  };
  return stream;
}

// ChildProcess class - EventEmitter-like
class ChildProcess {
  private _listeners: Record<string, EventListener[]> = {};
  private _onceListeners: Record<string, EventListener[]> = {};

  pid: number = Math.floor(Math.random() * 10000) + 1000;
  killed: boolean = false;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  connected: boolean = false;
  spawnfile: string = "";
  spawnargs: string[] = [];

  stdin: StdinStreamImpl;
  stdout: Readable;
  stderr: Readable;
  stdio: [StdinStreamImpl, Readable, Readable, undefined, undefined];

  constructor() {
    this.stdin = createStdin();
    this.stdout = createOutputStream() as unknown as Readable;
    this.stderr = createOutputStream() as unknown as Readable;
    this.stdio = [this.stdin, this.stdout, this.stderr, undefined, undefined];
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    if (!this._onceListeners[event]) this._onceListeners[event] = [];
    this._onceListeners[event].push(listener);
    return this;
  }

  off(event: string, listener: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(listener);
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: unknown[]): boolean {
    let handled = false;
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => {
        fn(...args);
        handled = true;
      });
    }
    if (this._onceListeners[event]) {
      this._onceListeners[event].forEach((fn) => {
        fn(...args);
        handled = true;
      });
      this._onceListeners[event] = [];
    }
    return handled;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.signalCode = (typeof signal === "string" ? signal : "SIGTERM") as NodeJS.Signals;
    return true;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  disconnect(): void {
    this.connected = false;
  }

  send(
    _message: unknown,
    _sendHandle?: unknown,
    _options?: unknown,
    _callback?: (error: Error | null) => void
  ): boolean {
    return false;
  }

  _complete(stdout: string, stderr: string, code: number): void {
    this.exitCode = code;

    // Emit data events for stdout/stderr as single chunks
    if (stdout) {
      const buf = Buffer.from(stdout);
      (this.stdout as unknown as OutputStreamLike).emit("data", buf);
    }
    if (stderr) {
      const buf = Buffer.from(stderr);
      (this.stderr as unknown as OutputStreamLike).emit("data", buf);
    }

    // Emit end events
    (this.stdout as unknown as OutputStreamLike).emit("end");
    (this.stderr as unknown as OutputStreamLike).emit("end");

    // Emit close event (code, signal)
    this.emit("close", code, this.signalCode);

    // Emit exit event
    this.emit("exit", code, this.signalCode);
  }

  // EventEmitter interface
  addListener(event: string, listener: EventListener): this {
    return this.on(event, listener);
  }

  removeAllListeners(event?: string): this {
    if (event) {
      delete this._listeners[event];
      delete this._onceListeners[event];
    } else {
      this._listeners = {};
      this._onceListeners = {};
    }
    return this;
  }

  setMaxListeners(): this {
    return this;
  }

  getMaxListeners(): number {
    return 10;
  }

  listeners(event: string): Function[] {
    return [...(this._listeners[event] || []), ...(this._onceListeners[event] || [])];
  }

  rawListeners(event: string): Function[] {
    return this.listeners(event);
  }

  listenerCount(event: string): number {
    return (this._listeners[event] || []).length + (this._onceListeners[event] || []).length;
  }

  prependListener(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].unshift(listener);
    return this;
  }

  prependOnceListener(event: string, listener: EventListener): this {
    if (!this._onceListeners[event]) this._onceListeners[event] = [];
    this._onceListeners[event].unshift(listener);
    return this;
  }

  eventNames(): (string | symbol)[] {
    return [...new Set([...Object.keys(this._listeners), ...Object.keys(this._onceListeners)])];
  }

  [Symbol.dispose](): void {
    this.kill();
  }
}

// exec - execute shell command, callback when done
function exec(
  command: string,
  options?: nodeChildProcess.ExecOptions | ((error: Error | null, stdout: string, stderr: string) => void),
  callback?: (error: Error | null, stdout: string, stderr: string) => void
): ChildProcess {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const child = new ChildProcess();
  child.spawnargs = ["bash", "-c", command];
  child.spawnfile = "bash";

  // Execute asynchronously via host bridge
  (async () => {
    try {
      const jsonResult = await _childProcessExecRaw.apply(undefined, [command], { result: { promise: true } });
      const result = JSON.parse(jsonResult) as { stdout: string; stderr: string; code: number };
      const stdout = result.stdout || "";
      const stderr = result.stderr || "";
      const code = result.code || 0;

      child._complete(stdout, stderr, code);

      if (callback) {
        if (code !== 0) {
          const err = new Error("Command failed: " + command) as Error & {
            code: number;
            killed: boolean;
            signal: null;
            cmd: string;
            stdout: string;
            stderr: string;
          };
          err.code = code;
          err.killed = false;
          err.signal = null;
          err.cmd = command;
          err.stdout = stdout;
          err.stderr = stderr;
          callback(err, stdout, stderr);
        } else {
          callback(null, stdout, stderr);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      child._complete("", errMsg, 1);
      if (callback) {
        const error = err instanceof Error ? err : new Error(String(err));
        (error as unknown as { code: number; stdout: string; stderr: string }).code = 1;
        (error as unknown as { code: number; stdout: string; stderr: string }).stdout = "";
        (error as unknown as { code: number; stdout: string; stderr: string }).stderr = errMsg;
        callback(error, "", errMsg);
      }
    }
  })();

  return child;
}

// execSync - synchronous shell execution
function execSync(
  command: string,
  options?: nodeChildProcess.ExecSyncOptions
): Buffer | string {
  // Use synchronous bridge call - result is JSON string
  const jsonResult = _childProcessExecRaw.applySyncPromise(undefined, [command]);
  const result = JSON.parse(jsonResult) as { stdout: string; stderr: string; code: number };

  if (result.code !== 0) {
    const err = new Error("Command failed: " + command) as Error & {
      status: number;
      stdout: string;
      stderr: string;
      output: [null, string, string];
    };
    err.status = result.code;
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    err.output = [null, result.stdout, result.stderr];
    throw err;
  }

  if (options?.encoding === "buffer" || !options?.encoding) {
    return Buffer.from(result.stdout);
  }
  return result.stdout;
}

// spawn - spawn a command with streaming
function spawn(
  command: string,
  args?: readonly string[] | nodeChildProcess.SpawnOptions,
  options?: nodeChildProcess.SpawnOptions
): ChildProcess {
  let argsArray: string[] = [];
  if (Array.isArray(args)) {
    argsArray = [...args];
  } else if (args) {
    options = args as nodeChildProcess.SpawnOptions;
  }

  const child = new ChildProcess();
  child.spawnfile = command;
  child.spawnargs = [command, ...argsArray];

  // Check if it's a shell command
  const useShell = options?.shell || false;

  // Execute asynchronously
  (async () => {
    try {
      let jsonResult: string;
      if (useShell || command === "bash" || command === "sh") {
        // Use shell execution
        const fullCmd = [command, ...argsArray].join(" ");
        jsonResult = await _childProcessExecRaw.apply(undefined, [fullCmd], { result: { promise: true } });
      } else {
        // Use spawn - args passed as JSON string for transferability
        jsonResult = await _childProcessSpawnRaw.apply(undefined, [command, JSON.stringify(argsArray)], {
          result: { promise: true },
        });
      }
      const result = JSON.parse(jsonResult) as { stdout: string; stderr: string; code: number };

      child._complete(result.stdout || "", result.stderr || "", result.code || 0);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      child._complete("", errMsg, 1);
      child.emit("error", err);
    }
  })();

  return child;
}

// spawnSync - synchronous spawn
function spawnSync(
  command: string,
  args?: readonly string[] | nodeChildProcess.SpawnSyncOptions,
  options?: nodeChildProcess.SpawnSyncOptions
): nodeChildProcess.SpawnSyncReturns<Buffer> {
  let argsArray: string[] = [];
  if (Array.isArray(args)) {
    argsArray = [...args];
  } else if (args) {
    options = args as nodeChildProcess.SpawnSyncOptions;
  }

  try {
    // Args passed as JSON string for transferability
    const jsonResult = _childProcessSpawnRaw.applySyncPromise(undefined, [command, JSON.stringify(argsArray)]);
    const result = JSON.parse(jsonResult) as { stdout: string; stderr: string; code: number };

    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      output: [null, Buffer.from(result.stdout), Buffer.from(result.stderr)],
      stdout: Buffer.from(result.stdout),
      stderr: Buffer.from(result.stderr),
      status: result.code,
      signal: null,
      error: undefined,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      pid: 0,
      output: [null, Buffer.from(""), Buffer.from(errMsg)],
      stdout: Buffer.from(""),
      stderr: Buffer.from(errMsg),
      status: 1,
      signal: null,
      error: err as Error,
    };
  }
}

// execFile - execute a file directly
function execFile(
  file: string,
  args?: readonly string[] | nodeChildProcess.ExecFileOptions | null,
  options?: nodeChildProcess.ExecFileOptions | ((error: Error | null, stdout: string, stderr: string) => void) | null,
  callback?: (error: Error | null, stdout: string, stderr: string) => void
): ChildProcess {
  let argsArray: string[] = [];
  let opts: nodeChildProcess.ExecFileOptions | undefined;
  let cb: ((error: Error | null, stdout: string, stderr: string) => void) | undefined;

  if (typeof args === "function") {
    cb = args as unknown as (error: Error | null, stdout: string, stderr: string) => void;
  } else if (Array.isArray(args)) {
    argsArray = [...args];
    if (typeof options === "function") {
      cb = options;
    } else {
      opts = options ?? undefined;
      cb = callback;
    }
  } else if (args && typeof args === "object") {
    opts = args as nodeChildProcess.ExecFileOptions;
    if (typeof options === "function") {
      cb = options;
    } else {
      cb = callback;
    }
  } else {
    if (typeof options === "function") {
      cb = options;
    } else {
      cb = callback;
    }
  }

  // execFile is like spawn but with callback
  const child = spawn(file, argsArray, opts);

  let stdout = "";
  let stderr = "";

  (child.stdout as unknown as OutputStreamLike).on("data", (data: Buffer) => {
    stdout += data.toString();
  });
  (child.stderr as unknown as OutputStreamLike).on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", (code: number) => {
    if (cb) {
      if (code !== 0) {
        const err = new Error("Command failed: " + file) as Error & {
          code: number;
          stdout: string;
          stderr: string;
        };
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        cb(err, stdout, stderr);
      } else {
        cb(null, stdout, stderr);
      }
    }
  });

  child.on("error", (err: Error) => {
    if (cb) {
      cb(err, stdout, stderr);
    }
  });

  return child;
}

// execFileSync
function execFileSync(
  file: string,
  args?: readonly string[] | nodeChildProcess.ExecFileSyncOptions,
  options?: nodeChildProcess.ExecFileSyncOptions
): Buffer | string {
  let argsArray: string[] = [];
  let opts: nodeChildProcess.ExecFileSyncOptions | undefined;

  if (Array.isArray(args)) {
    argsArray = [...args];
    opts = options;
  } else {
    opts = args as nodeChildProcess.ExecFileSyncOptions;
  }

  const result = spawnSync(file, argsArray, opts);

  if (result.status !== 0) {
    const err = new Error("Command failed: " + file) as Error & {
      status: number | null;
      stdout: Buffer;
      stderr: Buffer;
    };
    err.status = result.status;
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    throw err;
  }

  if (opts?.encoding === "buffer" || !opts?.encoding) {
    return result.stdout;
  }
  return result.stdout.toString(opts.encoding as BufferEncoding);
}

// fork - spawn a node process with IPC
function fork(
  modulePath: string,
  args?: readonly string[] | nodeChildProcess.ForkOptions,
  options?: nodeChildProcess.ForkOptions
): ChildProcess {
  let argsArray: string[] = [];
  if (Array.isArray(args)) {
    argsArray = [...args];
  } else if (args) {
    options = args as nodeChildProcess.ForkOptions;
  }

  // Fork executes a node script - we use spawn with node
  const child = spawn("node", [modulePath, ...argsArray], {
    ...options,
    stdio: options?.stdio || "pipe",
  } as nodeChildProcess.SpawnOptions);

  // Add IPC-like methods (stubs)
  child.connected = true;

  return child;
}

// Create the child_process module
const childProcess = {
  ChildProcess,
  exec,
  execSync,
  spawn,
  spawnSync,
  execFile,
  execFileSync,
  fork,
};

// Export the module
export default childProcess;
