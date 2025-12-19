# Child Process Streaming Implementation Spec

Enable full `child_process` support in `sandboxed-node` by bridging through the `CommandExecutor` interface to nanosandbox's `HostExecContext`.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ WASIX bash/shell                                                        │
│   Runs "node -e 'code...'" via host_exec syscall                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ host_exec syscall
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ wasmer-js scheduler                                                     │
│   Creates HostExecContext, calls hostExecHandler                        │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ hostExecHandler callback
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ nanosandbox (packages/nanosandbox/src/vm/index.ts)                      │
│   hostExecHandler detects "node" command                                │
│   Creates NodeProcess (sandboxed-node) with CommandExecutor             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ NodeProcess.exec(code)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ sandboxed-node isolate                                                  │
│   User code runs: child_process.spawn('cmd', ['args'])                  │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ ivm.Reference call
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ sandboxed-node host (src/index.ts)                                      │
│   Receives spawn request, calls commandExecutor.spawn()                 │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ CommandExecutor.spawn()
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ nanosandbox CommandExecutor implementation                              │
│   Adds spawn request to HostExecContext for wasmer-js to handle         │
│   OR spawns directly via Node.js child_process                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Example

1. WASIX shell runs: `node -e "require('child_process').spawn('echo', ['hi'])"`
2. WASIX calls `host_exec("node", ["-e", "..."])`
3. wasmer-js scheduler invokes `hostExecHandler(ctx)`
4. nanosandbox `hostExecHandler` creates `NodeProcess` with a `CommandExecutor`
5. `NodeProcess.exec()` runs the code in isolated-vm
6. User code calls `spawn('echo', ['hi'])`
7. Bridge calls `_childProcessSpawnStart` Reference back to host
8. Host's `CommandExecutor.spawn()` is invoked
9. nanosandbox implementation either:
   - Spawns via native Node.js `child_process` (simple case)
   - OR adds to HostExecContext for nested WASIX spawn (sandboxed case)

---

## Part 1: sandboxed-node - CommandExecutor Interface

### 1.1 Define SpawnedProcess interface

**File:** `packages/sandboxed-node/src/index.ts`

```typescript
/**
 * Handle for a spawned child process with streaming I/O.
 */
export interface SpawnedProcess {
  /** Write to process stdin */
  writeStdin(data: Uint8Array | string): void;
  /** Close stdin (signal EOF) */
  closeStdin(): void;
  /** Kill the process with optional signal (default SIGTERM=15) */
  kill(signal?: number): void;
  /** Wait for process to exit, returns exit code */
  wait(): Promise<number>;
}

/**
 * Interface for executing commands from sandboxed code.
 * Implemented by nanosandbox to handle child process requests.
 */
export interface CommandExecutor {
  /** Execute shell command, return stdout/stderr/code */
  exec(command: string): Promise<{ stdout: string; stderr: string; code: number }>;

  /** Run command with args, return stdout/stderr/code */
  run(command: string, args?: string[]): Promise<{ stdout: string; stderr: string; code: number }>;

  /** Spawn command with streaming I/O */
  spawn(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      onStdout?: (data: Uint8Array) => void;
      onStderr?: (data: Uint8Array) => void;
    }
  ): SpawnedProcess;
}
```

### 1.2 Add spawn References in NodeProcess

**File:** `packages/sandboxed-node/src/index.ts` (in setupBridge)

```typescript
// Child process streaming support
if (this.commandExecutor?.spawn) {
  const executor = this.commandExecutor;
  let nextSessionId = 1;
  const sessions = new Map<number, SpawnedProcess>();

  // Get dispatcher reference from isolate (set by bridge code)
  const dispatchRef = context.global.getSync('_childProcessDispatch', { reference: true });

  // Start a spawn - returns session ID
  const spawnStartRef = new ivm.Reference(
    (command: string, argsJson: string, optionsJson: string): number => {
      const args = JSON.parse(argsJson) as string[];
      const options = JSON.parse(optionsJson) as { cwd?: string; env?: Record<string, string> };
      const sessionId = nextSessionId++;

      const proc = executor.spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        onStdout: (data) => {
          dispatchRef.applySync(undefined, [sessionId, 'stdout', data], { arguments: { copy: true } });
        },
        onStderr: (data) => {
          dispatchRef.applySync(undefined, [sessionId, 'stderr', data], { arguments: { copy: true } });
        },
      });

      proc.wait().then(code => {
        dispatchRef.applySync(undefined, [sessionId, 'exit', code]);
        sessions.delete(sessionId);
      });

      sessions.set(sessionId, proc);
      return sessionId;
    }
  );

  // Stdin write
  const stdinWriteRef = new ivm.Reference((sessionId: number, data: Uint8Array): void => {
    sessions.get(sessionId)?.writeStdin(data);
  });

  // Stdin close
  const stdinCloseRef = new ivm.Reference((sessionId: number): void => {
    sessions.get(sessionId)?.closeStdin();
  });

  // Kill
  const killRef = new ivm.Reference((sessionId: number, signal: number): void => {
    sessions.get(sessionId)?.kill(signal);
  });

  await jail.set('_childProcessSpawnStart', spawnStartRef);
  await jail.set('_childProcessStdinWrite', stdinWriteRef);
  await jail.set('_childProcessStdinClose', stdinCloseRef);
  await jail.set('_childProcessKill', killRef);
}
```

### 1.3 Update bridge/child-process.ts

**File:** `packages/sandboxed-node/bridge/child-process.ts`

```typescript
// Host bridge declarations for streaming mode
declare const _childProcessSpawnStart: {
  applySyncPromise(ctx: undefined, args: [string, string, string]): number;
} | undefined;

declare const _childProcessStdinWrite: {
  applySyncPromise(ctx: undefined, args: [number, Uint8Array]): void;
} | undefined;

declare const _childProcessStdinClose: {
  applySyncPromise(ctx: undefined, args: [number]): void;
} | undefined;

declare const _childProcessKill: {
  applySyncPromise(ctx: undefined, args: [number, number]): void;
} | undefined;

// Active children registry
const activeChildren = new Map<number, ChildProcess>();

// Global dispatcher - host calls this when data arrives
(globalThis as Record<string, unknown>)._childProcessDispatch = (
  sessionId: number,
  type: 'stdout' | 'stderr' | 'exit',
  data: Uint8Array | number
): void => {
  const child = activeChildren.get(sessionId);
  if (!child) return;

  if (type === 'stdout') {
    child.stdout.emit('data', Buffer.from(data as Uint8Array));
  } else if (type === 'stderr') {
    child.stderr.emit('data', Buffer.from(data as Uint8Array));
  } else if (type === 'exit') {
    child.exitCode = data as number;
    child.stdout.emit('end');
    child.stderr.emit('end');
    child.emit('close', data, null);
    child.emit('exit', data, null);
    activeChildren.delete(sessionId);
  }
};

// spawn() implementation using streaming when available
function spawn(command: string, args?: string[], options?: SpawnOptions): ChildProcess {
  const child = new ChildProcess();

  if (typeof _childProcessSpawnStart !== 'undefined') {
    // Streaming mode
    const sessionId = _childProcessSpawnStart.applySyncPromise(undefined, [
      command,
      JSON.stringify(args || []),
      JSON.stringify({ cwd: options?.cwd, env: options?.env })
    ]);

    activeChildren.set(sessionId, child);

    child.stdin.write = (data) => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      _childProcessStdinWrite!.applySyncPromise(undefined, [sessionId, bytes]);
      return true;
    };

    child.stdin.end = () => {
      _childProcessStdinClose!.applySyncPromise(undefined, [sessionId]);
    };

    child.kill = (signal) => {
      const sig = signal === 'SIGKILL' ? 9 : 15;
      _childProcessKill!.applySyncPromise(undefined, [sessionId, sig]);
      child.killed = true;
      return true;
    };

    return child;
  }

  // Fallback to batch mode...
}
```

---

## Part 2: nanosandbox - CommandExecutor Implementation

### 2.1 Create CommandExecutor adapter

**File:** `packages/nanosandbox/src/command-executor.ts`

```typescript
import { spawn as nodeSpawn } from 'node:child_process';
import type { CommandExecutor, SpawnedProcess } from 'sandboxed-node';

/**
 * CommandExecutor that spawns real processes on the host.
 * Used when sandboxed code calls child_process.spawn().
 */
export function createHostCommandExecutor(): CommandExecutor {
  return {
    async exec(command: string) {
      // Use bash to execute shell command
      return new Promise((resolve) => {
        const child = nodeSpawn('bash', ['-c', command]);
        let stdout = '', stderr = '';
        child.stdout?.on('data', (d) => stdout += d);
        child.stderr?.on('data', (d) => stderr += d);
        child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      });
    },

    async run(command: string, args?: string[]) {
      return new Promise((resolve) => {
        const child = nodeSpawn(command, args || []);
        let stdout = '', stderr = '';
        child.stdout?.on('data', (d) => stdout += d);
        child.stderr?.on('data', (d) => stderr += d);
        child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
      });
    },

    spawn(command, args, options): SpawnedProcess {
      const child = nodeSpawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (data: Buffer) => {
        options.onStdout?.(new Uint8Array(data));
      });

      child.stderr?.on('data', (data: Buffer) => {
        options.onStderr?.(new Uint8Array(data));
      });

      let exitCode = 0;
      const exitPromise = new Promise<number>((resolve) => {
        child.on('close', (code) => {
          exitCode = code ?? 0;
          resolve(exitCode);
        });
      });

      return {
        writeStdin(data) {
          const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
          child.stdin?.write(buf);
        },
        closeStdin() {
          child.stdin?.end();
        },
        kill(signal = 15) {
          child.kill(signal === 9 ? 'SIGKILL' : 'SIGTERM');
        },
        wait() {
          return exitPromise;
        },
      };
    },
  };
}
```

### 2.2 Pass CommandExecutor to NodeProcess

**File:** `packages/nanosandbox/src/vm/index.ts` (in handleNodeCommand)

```typescript
import { createHostCommandExecutor } from '../command-executor.js';

async function handleNodeCommand(ctx: HostExecContext): Promise<number> {
  // ... existing code ...

  const nodeProcess = new NodeProcess({
    memoryLimit: 128,
    processConfig: { /* ... */ },
    commandExecutor: createHostCommandExecutor(), // NEW
  });

  // ... rest of existing code ...
}
```

---

## Part 3: Sandboxed Spawns (Optional - Full Isolation)

For fully sandboxed child processes (where child_process.spawn() creates another WASIX process instead of a real process), the CommandExecutor would need to:

1. Add spawn request to a queue in HostExecContext
2. wasmer-js scheduler picks up the request
3. Creates a new WASIX instance for the child
4. Streams stdin/stdout between parent and child

This is more complex and requires wasmer-js changes. The simpler approach above spawns real host processes, which is sufficient for most use cases (npm, build tools, etc.).

---

## Implementation Order

### Phase 1: sandboxed-node
1. Add `SpawnedProcess` interface
2. Add `spawn()` to `CommandExecutor` interface
3. Add session management and References in NodeProcess
4. Update bridge `spawn()` to use streaming mode
5. Test with mock CommandExecutor

### Phase 2: nanosandbox
1. Create `createHostCommandExecutor()`
2. Pass CommandExecutor to NodeProcess in handleNodeCommand
3. Integration tests

### Phase 3: Tests
1. stdout streaming test
2. stdin write test
3. kill test
4. Interactive process test

---

## Testing

```typescript
describe('child_process streaming', () => {
  it('should stream stdout', async () => {
    const result = await nodeProcess.exec(`
      const { spawn } = require('child_process');
      const child = spawn('echo', ['hello']);
      child.stdout.on('data', (d) => console.log('got:', d.toString().trim()));
    `);
    expect(result.stdout).toContain('got: hello');
  });

  it('should write to stdin', async () => {
    const result = await nodeProcess.exec(`
      const { spawn } = require('child_process');
      const child = spawn('cat');
      child.stdin.write('hello\\n');
      child.stdin.end();
      child.stdout.on('data', (d) => console.log(d.toString()));
    `);
    expect(result.stdout).toContain('hello');
  });

  it('should kill process', async () => {
    const result = await nodeProcess.exec(`
      const { spawn } = require('child_process');
      const child = spawn('sleep', ['10']);
      setTimeout(() => child.kill(), 100);
      child.on('close', () => console.log('killed'));
    `);
    expect(result.stdout).toContain('killed');
  });
});
```
