## Why

Sandbox module loading still depends on whether a caller mounted a filesystem at the expected location. This creates avoidable setup fragility and inconsistent behavior for `node_modules` imports, even though dependency loading is a core runtime need.

## What Changes

- **BREAKING** Make a read-only `/app/node_modules` overlay always available in Node runtime when `<cwd>/node_modules` exists, even when no base `VirtualFileSystem` is configured.
- Add driver-level default overlay behavior that sources projected package contents from host `<cwd>/node_modules` and keeps strict realpath containment under that root.
- Keep projection read-only and deny all write/mutation operations under `/app/node_modules` regardless of broader fs permissions.
- Preserve deny-by-default behavior for non-overlay filesystem paths when no base filesystem is mounted.
- Refactor runtime module loading to rely on one shared filesystem interface (`VirtualFileSystem`) instead of split paths for "base fs vs module projection" checks.
- Update security/compatibility documentation for the new always-on module overlay boundary.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `node-runtime`: require an always-present read-only `/app/node_modules` overlay sourced from scoped host `cwd/node_modules`, including behavior when base filesystem is absent or mounted elsewhere.
- `node-permissions`: preserve deny-by-default outside overlay while enforcing read-only invariants inside overlay paths.
- `compatibility-governance`: require friction/security documentation updates whenever always-on node_modules overlay boundary behavior changes.

## Impact

- Affected code:
  - `packages/secure-exec/src/node/driver.ts`
  - `packages/secure-exec/src/node/module-access.ts`
  - `packages/secure-exec/src/index.ts`
  - `packages/secure-exec/src/types.ts`
- Affected tests:
  - `packages/secure-exec/tests/module-access.test.ts`
  - `packages/secure-exec/tests/index.test.ts` (module loading paths)
  - project-matrix fixture coverage for dependency loading parity
  - exploit-oriented tests for path escape and write-attempt denial under overlay
- Affected docs/governance:
  - `docs-internal/friction/secure-exec.md`
  - `docs/security-model.mdx`
  - `docs/node-compatability.mdx` (if user-visible runtime loading behavior callouts change)
