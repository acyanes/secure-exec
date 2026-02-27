## ADDED Requirements

### Requirement: Package Metadata-Aware Module Classification
The runtime MUST classify JavaScript modules using Node-compatible metadata rules (extension plus nearest `package.json` module type), not source-token heuristics alone.

#### Scenario: .js under type module is treated as ESM
- **WHEN** a package has `package.json` with `"type": "module"` and sandboxed code loads `./index.js`
- **THEN** the runtime MUST evaluate the file as ESM semantics (including `import.meta` availability and ESM export behavior)

#### Scenario: .js under type commonjs is treated as CJS
- **WHEN** a package has `package.json` with `"type": "commonjs"` (or no ESM override) and sandboxed code loads `./index.js` via `require`
- **THEN** the runtime MUST evaluate the file as CommonJS and return `module.exports`

### Requirement: Dynamic Import Error Fidelity
Dynamic `import()` handling MUST preserve Node-like failure behavior by surfacing ESM compile/instantiate/evaluate errors directly and avoiding unintended fallback masking.

#### Scenario: ESM syntax failure rejects without require fallback masking
- **WHEN** user code executes `await import("./broken.mjs")` and `./broken.mjs` contains invalid ESM syntax
- **THEN** the Promise MUST reject with an ESM compile/evaluation error for that module rather than a fallback `require()`-style resolution error

#### Scenario: ESM runtime failure rejects with module error
- **WHEN** user code executes `await import("./throws.mjs")` and the imported module throws during evaluation
- **THEN** the Promise MUST reject with that evaluation failure and MUST NOT re-route to CommonJS fallback

### Requirement: CJS Namespace Shape for Dynamic Import
When dynamic `import()` resolves a CommonJS module, the returned namespace object MUST preserve Node-compatible default semantics for `module.exports` values across object, function, primitive, and null exports.

#### Scenario: Primitive CommonJS export is accessible as default
- **WHEN** sandboxed code executes `await import("./primitive.cjs")` and `primitive.cjs` sets `module.exports = 7`
- **THEN** the namespace result MUST expose `default === 7` without throwing during namespace construction

#### Scenario: Null CommonJS export is accessible as default
- **WHEN** sandboxed code executes `await import("./nullish.cjs")` and `nullish.cjs` sets `module.exports = null`
- **THEN** the namespace result MUST expose `default === null` without throwing during namespace construction
