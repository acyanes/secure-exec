## ADDED Requirements

### Requirement: Builtin Resolver Helpers Return Builtin Identifiers
Builtin module resolution through helper APIs MUST return builtin identifiers directly instead of attempting filesystem lookup.

#### Scenario: require.resolve returns builtin id
- **WHEN** sandboxed code calls `require.resolve("fs")`
- **THEN** the call MUST succeed and return a builtin identifier for `fs` (for example `"fs"` or `"node:fs"`)

#### Scenario: createRequire resolve returns builtin id
- **WHEN** sandboxed code calls `createRequire("/app/entry.js").resolve("path")`
- **THEN** the call MUST succeed and return a builtin identifier for `path` (for example `"path"` or `"node:path"`)

### Requirement: Bridged Builtins Support ESM Default and Named Imports
For bridged built-in modules exposed to ESM, the runtime MUST provide both default export access and named-import access for supported APIs.

#### Scenario: fs named import is available in ESM
- **WHEN** sandboxed ESM code executes `import { readFileSync } from "node:fs"`
- **THEN** `readFileSync` MUST resolve to a callable function equivalent to `default.readFileSync`

#### Scenario: path named import is available in ESM
- **WHEN** sandboxed ESM code executes `import { sep } from "node:path"`
- **THEN** `sep` MUST resolve to the same value as `default.sep`
