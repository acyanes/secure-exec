## MODIFIED Requirements

### Requirement: Projected Node-Modules Paths MUST Be Read-Only
When driver-managed node_modules overlay/projection is active (including always-on `/app/node_modules` overlay), projected sandbox module paths (including `/app/node_modules` and descendants) MUST be treated as read-only runtime state.

#### Scenario: Sandboxed write targets projected module file
- **WHEN** sandboxed code attempts `writeFile`, `unlink`, or `rename` for a path under projected `/app/node_modules`
- **THEN** the operation MUST be denied with `EACCES` regardless of broader filesystem allow rules

#### Scenario: Sandboxed directory mutation targets projected module tree
- **WHEN** sandboxed code attempts `mkdir` or `rmdir` under projected `/app/node_modules`
- **THEN** the operation MUST be denied with `EACCES`

### Requirement: Module Projection MUST Preserve Deny-By-Default Outside Allowed Closure
Node-modules overlay access SHALL NOT grant implicit read access to non-overlay host filesystem paths, and deny-by-default behavior MUST remain intact outside `/app/node_modules` when permission checks do not allow access.

#### Scenario: Sandbox attempts to read host path outside projected closure
- **WHEN** module projection is configured and sandboxed code accesses a filesystem path outside the projected closure without explicit fs permission allowance
- **THEN** access MUST remain denied by existing deny-by-default permission behavior

#### Scenario: Overlay availability does not auto-allow unrelated host reads
- **WHEN** always-on `/app/node_modules` overlay is available and sandboxed code attempts to read `/etc/passwd` without explicit fs permission allowance
- **THEN** runtime MUST deny the read with `EACCES`
