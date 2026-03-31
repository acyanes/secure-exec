# Pre-existing test failures

Cataloged 2026-03-30. None are release blockers — all are implementation gaps or test fixture issues.

## @secure-exec/core (36 failures)

**socket-shutdown tests** — `test/kernel/socket-shutdown.test.ts`

All 36 failures: `SocketTable` constructed without `networkCheck` fixture. Deny-by-default rejects `listen()` with `EACCES`. Fix by providing an explicit `networkCheck` that allows loopback in test setup.

## @secure-exec/nodejs (4 failures)

**VFS error codes** — `test/kernel-runtime.test.ts` (3 failures)

Tests expect `EACCES` for `/etc/passwd` reads, symlink traversal, and path traversal. VFS correctly returns `ENOENT` — file doesn't exist in sandbox. Update expectations to `ENOENT`.

**stdin piping** — `test/kernel-runtime.test.ts` (1 failure)

Writes to stdin, expects output containing `hello from stdin`. Investigate whether stdin bridge drops data or test timing is off.

## @secure-exec/typescript (2 failures)

**VFS directory setup** — `tests/typescript-tools.integration.test.ts`

`filesystem.mkdir("/root/src")` fails with `ENOENT` because `/root` doesn't exist. Fix with `{ recursive: true }` or bootstrap `/root` in test setup.

## secure-exec (83 + 5 failures)

**test:runtime-driver script glob** — `package.json` (fixed, ready to commit)

Glob `tests/runtime-driver/*.test.ts` didn't match `tests/runtime-driver/node/*.test.ts`. Updated to `tests/runtime-driver/node/`.

**stream polyfills** — `tests/test-suite/node/polyfills.ts` (5 failures)

Missing or incomplete `node:stream` bridge implementation.

**disposeSharedV8Runtime** — `tests/runtime-driver/node/v8-lifecycle.test.ts` (3 failures)

`disposeSharedV8Runtime` imported but not exported from the package. Wire the export.

**bridge hardening** — `tests/runtime-driver/node/bridge-hardening.test.ts` (9 failures)

- FD table limit enforcement (EMFILE at 1024, reopen after close)
- `process.chdir` to existing directory
- Module cache isolation in `__unsafeCreateContext`
- `process.nextTick` / `setTimeout` error routing through `uncaughtException`
- `process.kill(process.pid, 'SIGTERM')` handler dispatch
- HTTP body buffering cap (50MB via repeated `write()`)

**runtime-driver implementation gaps** — multiple files (~68 failures)

- `index.test.ts` (49) — Promise subclass methods, HTTP/2 allowHTTP1 fallback, Node API parity
- `payload-limits.test.ts` (7) — payload size enforcement edge cases
- `resource-budgets.test.ts` (6) — resource budget enforcement
- `module-access.test.ts` (5) — module resolution edge cases
- `context-snapshot-behavior.test.ts` (1) — context snapshot edge case
- `ssrf-protection.test.ts` (1) — SSRF protection edge case
- `module-access-compat.test.ts` (1) — module compat edge case
- `hono-fetch-external.test.ts` (1) — external fetch edge case
