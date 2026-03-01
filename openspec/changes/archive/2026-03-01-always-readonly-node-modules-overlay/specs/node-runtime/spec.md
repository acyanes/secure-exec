## ADDED Requirements

### Requirement: Always-On CWD Node-Modules Overlay MUST Be Scoped and Read-Only
The Node runtime SHALL always expose `/app/node_modules` as a read-only overlay sourced from `<overlay.cwd>/node_modules` (default `<overlay.cwd> = process.cwd()`), independent of whether a base `VirtualFileSystem` is mounted.

#### Scenario: Overlay is available without base filesystem adapter
- **WHEN** a caller creates `NodeProcess` without a base filesystem adapter and host `<overlay.cwd>/node_modules` contains package `left-pad`
- **THEN** sandboxed code requiring `left-pad` from `/app` MUST resolve through `/app/node_modules` overlay content

#### Scenario: Overlay remains available when base filesystem mount differs
- **WHEN** a caller mounts a base filesystem rooted outside `/app` and host `<overlay.cwd>/node_modules` contains package `zod`
- **THEN** sandboxed code requiring `zod` from `/app` MUST resolve via `/app/node_modules` overlay without requiring base filesystem remounting

#### Scenario: Overlay path escaping configured node_modules root is rejected
- **WHEN** an overlay-backed read resolves to a canonical host path outside canonical `<overlay.cwd>/node_modules`
- **THEN** runtime MUST fail with a deterministic out-of-scope error and MUST NOT expose the escaped path to sandbox execution

### Requirement: Runtime Module Resolution MUST Use Unified Filesystem Access
Node runtime import and require resolution SHALL use one shared runtime filesystem interface and MUST NOT branch into a separate "filesystem unavailable" module-loading path when the overlay-backed driver is active.

#### Scenario: Bare package import resolves through shared runtime filesystem
- **WHEN** sandboxed code executes `require("lodash")` with overlay-enabled runtime filesystem
- **THEN** the resolver MUST perform package resolution through the shared runtime filesystem interface rather than a separate host-resolution fallback path

#### Scenario: ESM dynamic import resolves through shared runtime filesystem
- **WHEN** sandboxed code executes `await import("zod")` with overlay-enabled runtime filesystem
- **THEN** dynamic import resolution and module loading MUST use the same shared runtime filesystem interface used by CommonJS resolution

## MODIFIED Requirements

### Requirement: Projected Modules MUST Exclude Native Addons
Module projection and overlay-based loading SHALL reject native addon artifacts (`.node`) so projected dependency execution remains within supported sandbox module formats.

#### Scenario: Overlay dependency attempts to load native addon file
- **WHEN** sandboxed code or package runtime behavior attempts to load a `.node` artifact from `/app/node_modules`
- **THEN** runtime MUST fail deterministically and MUST NOT execute native addon code

## REMOVED Requirements

### Requirement: Allowed Host Node-Modules Projection MUST Be Explicit and Scoped
**Reason**: The new contract makes `/app/node_modules` an always-on overlay scoped to `<overlay.cwd>/node_modules`, removing explicit allowlist projection as a required setup step.
**Migration**: Remove reliance on `moduleAccess.allowPackages` as the runtime gate for package readability; enforce trust boundaries via overlay cwd containment and read-only policy.

### Requirement: Projected Module Closure MUST Include Runtime Dependencies
**Reason**: Full scoped overlay of `<overlay.cwd>/node_modules` makes transitive-closure pre-discovery unnecessary for default runtime module availability.
**Migration**: Replace closure-materialization assumptions with overlay boundary validation and runtime module-resolution tests.
