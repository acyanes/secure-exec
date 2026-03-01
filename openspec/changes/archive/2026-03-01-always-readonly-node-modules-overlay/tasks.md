## 1. Driver Overlay API And Filesystem Composition

- [x] 1.1 Add an always-on node_modules overlay filesystem composition path in `packages/secure-exec/src/node/driver.ts` that maps host `<cwd>/node_modules` to virtual `/app/node_modules` regardless of base filesystem presence.
- [x] 1.2 Refactor `packages/secure-exec/src/node/module-access.ts` (or replace with a new overlay fs module) to enforce canonical `<cwd>/node_modules` containment on every overlay read/stat/readdir/exists operation.
- [x] 1.3 Preserve read-only enforcement for `/app/node_modules/**` mutation operations (`writeFile`, `mkdir`, `remove*`, `rename`) with deterministic `EACCES` behavior.
- [x] 1.4 Remove or migrate allowlist/transitive-closure specific configuration paths (`allowPackages` discovery flow) in favor of the new always-on scoped overlay contract.

## 2. Runtime Module-Loading Simplification

- [x] 2.1 Update `packages/secure-exec/src/index.ts` module-loading paths (`require`, ESM resolve/compile, dynamic import) to rely on one shared runtime filesystem interface.
- [x] 2.2 Remove obsolete "filesystem unavailable" branch handling for module resolution that is superseded by always-on overlay-backed filesystem composition.
- [x] 2.3 Keep deterministic failure behavior for missing host `<cwd>/node_modules` or out-of-scope overlay resolution paths.

## 3. Test Coverage (Including Exploit Tests)

- [x] 3.1 Add runtime test: importing `node_modules` package succeeds with no base filesystem mounted (overlay-only path).
- [x] 3.2 Add runtime test: importing `node_modules` package succeeds when base filesystem is mounted at a different virtual location than `/app`.
- [x] 3.3 Add exploit test: symlink/path traversal attempt from `/app/node_modules` to outside `<cwd>/node_modules` is rejected with deterministic out-of-scope error.
- [x] 3.4 Add exploit test: write/mkdir/remove/rename attempts under `/app/node_modules/**` are denied with `EACCES`.
- [x] 3.5 Add regression test: non-overlay host paths remain denied by default permissions when overlay is enabled.
- [x] 3.6 Add compatibility matrix fixture coverage (host Node vs secure-exec) for overlay-backed third-party package import parity.
- [x] 3.7 Run targeted validation commands and record outcomes in this task file:
- [x] 3.8 `pnpm -C packages/secure-exec check-types`
- [x] 3.9 `pnpm --dir packages/secure-exec exec vitest run tests/module-access.test.ts tests/module-access-compat.test.ts`
- [x] 3.10 `pnpm --dir packages/secure-exec exec vitest run tests/index.test.ts -t \"node_modules\"`
- [x] 3.11 `pnpm --dir packages/secure-exec exec vitest run tests/project-matrix.test.ts -t \"overlay mode with host node parity\"`
- [x] 3.12 `pnpm turbo build --filter secure-exec`

Validation results:
- `pnpm -C packages/secure-exec check-types` ✅
- `pnpm --dir packages/secure-exec exec vitest run tests/module-access.test.ts tests/module-access-compat.test.ts` ✅
- `pnpm --dir packages/secure-exec exec vitest run tests/index.test.ts -t "node_modules"` ✅
- `pnpm --dir packages/secure-exec exec vitest run tests/project-matrix.test.ts -t "overlay mode with host node parity"` ✅
- `pnpm turbo build --filter secure-exec` ✅

## 4. Documentation And Governance Sync

- [x] 4.1 Update `docs/security-model.mdx` with always-on `/app/node_modules` overlay boundary and strict `<cwd>/node_modules` containment assumptions.
- [x] 4.2 Update `docs-internal/friction/secure-exec.md` with compatibility/security trade-offs from removing allowlist-scoped projection defaults.
- [x] 4.3 Update `docs/node-compatability.mdx` with user-visible module-loading behavior changes (overlay availability and read-only path behavior) if matrix-facing behavior changed.
