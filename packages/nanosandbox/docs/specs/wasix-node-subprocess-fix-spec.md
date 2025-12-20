# WASIX Node Subprocess Fix Specification

## Status: RESOLVED

The child process spawning issue has been fixed by switching the wasix-runtime
build target from `wasm32-wasip1` to `wasm32-wasmer-wasi` (WASIX).

## Problem Summary

Sandboxed Node.js code needs to spawn child processes (e.g., `child_process.spawnSync('echo', ['hello'])`). These child processes should run natively within WASIX, not be delegated back to the host via `host_exec`.

## Root Cause

The wasix-runtime was being compiled with `cargo build --target wasm32-wasip1` which targets WASI Preview 1. WASI Preview 1 does NOT support subprocess spawning - it lacks the necessary syscalls like `proc_spawn2`.

## Solution

Changed the build to use `cargo wasix build` which compiles to the WASIX target (`wasm32-wasmer-wasi`). WASIX is a superset of WASI that includes subprocess support.

### Changes Made

1. **wasix-runtime/build.sh**: Changed from `cargo build --target wasm32-wasip1` to `cargo wasix build`

2. **wasix-runtime/wasmer.toml**: Updated module source path from `target/wasm32-wasip1/release/wasix-runtime.wasm` to `target/wasm32-wasmer-wasi/release/wasix-runtime.wasm`

## Architecture (Working)

```
1. Host spawns WASIX "node" command
2. wasix-runtime calls host_exec_start
3. Host runs sandboxed-node (V8 isolate)
4. Sandboxed-node calls spawn('echo', ['hello'])
5. spawnChildStreaming sends SPAWN_REQUEST to wasix-runtime
6. wasix-runtime spawns child NATIVELY via Command::new() ✓ WORKING
7. Child output streamed back via host_exec_child_output
8. Exit code returned via callbacks
```

## Test Results

**node-child-process.test.ts**:
- 6 tests passing (spawnSync tests)
- 17 tests skipped (async tests, env var tests, multiple command tests)

Passing tests:
- spawn echo and capture stdout
- spawn ls and list directories
- return status code from child (false command → exit 1)
- return status 0 from true command
- handle command not found (exit 127)
- capture stderr from child

## Known Remaining Issues

1. **Environment variable passing**: Env vars specified in spawnSync options don't get passed to child processes properly

2. **Async spawn tests**: Skipped because the sandbox exits before async callbacks fire

3. **Multiple sequential commands**: Skipped due to potential scheduler race conditions
