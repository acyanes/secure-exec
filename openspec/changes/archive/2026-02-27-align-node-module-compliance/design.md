## Context

Sandboxed-node currently splits module semantics across `package-bundler`, `esm-utils`, `require-setup`, and the runtime execution pipeline in `NodeProcess`. Core flows work for common cases, but edge behaviors still diverge from Node in builtin resolver helpers, package metadata interpretation, and some dynamic import fallback/error paths. Existing tests validate baseline behavior but do not comprehensively lock down these edge semantics.

Constraints:
- Runtime behavior should match Node as closely as practical.
- Bridge scope remains Node built-ins only.
- Any intentional non-parity must be documented in compatibility/friction artifacts.

## Goals / Non-Goals

**Goals:**
- Align `import`/`require`/resolver-helper behavior with Node module semantics for high-friction edge cases.
- Remove error masking in dynamic import precompile/evaluation paths.
- Make CJS/ESM interop behavior deterministic and test-covered.
- Add a focused compatibility regression matrix so future changes cannot silently regress module semantics.

**Non-Goals:**
- Expanding unsupported stdlib modules or adding new host capabilities.
- Rewriting the entire loader architecture to exactly match Node internals.
- Implementing every Node loader hook/condition beyond current sandbox scope.

## Decisions

### 1. Use explicit Node baseline semantics for module behavior

**Choice:** Treat project Node compatibility targets as the baseline contract for module semantics, and codify any practical deviations explicitly.

**Rationale:** Module behavior has version-specific differences in modern Node. A declared baseline prevents ambiguous “Node-like” behavior.

**Alternative considered:** Target “latest Node” without pinning semantics. Rejected because this makes conformance unstable and hard to test.

### 2. Unify resolver behavior across require/import/helper APIs

**Choice:** Consolidate builtin handling and package metadata decisions so `require`, `import`, and resolver helpers (`require.resolve`, `createRequire(...).resolve`) share consistent rules.

**Rationale:** Current behavior differs depending on entrypoint (`_requireFrom` vs `_resolveModule`), which creates user-visible drift.

**Alternative considered:** Keep separate code paths and patch individual edge cases. Rejected because it perpetuates divergence.

### 3. Replace syntax-heuristic module classification with metadata-aware classification

**Choice:** Classify ESM/CJS using file extension plus nearest `package.json` module-type metadata, rather than regex-only source scanning.

**Rationale:** Heuristic token checks are not Node semantics and fail on valid edge cases.

**Alternative considered:** Extend regex heuristics. Rejected as brittle and still non-compliant.

### 4. Preserve dynamic import laziness while preventing fallback error masking

**Choice:** Keep lazy dynamic import evaluation, but stop swallowing compile/instantiate failures and only apply CJS fallback where appropriate.

**Rationale:** Lazy behavior is already required; the remaining gap is incorrect error/fallback behavior.

**Alternative considered:** Remove fallback entirely. Rejected to preserve compatibility for computed or explicitly CJS-oriented cases.

### 5. Add an explicit module-compat regression matrix in tests

**Choice:** Add targeted tests for resolver helpers, package metadata precedence, dynamic import error propagation, and CJS/ESM interop edge shapes.

**Rationale:** Existing tests cover happy paths; regressions recur in untested edge paths.

**Alternative considered:** Rely on ad hoc bug-driven tests. Rejected due recurring drift.

## Risks / Trade-offs

- **[Risk] Behavior changes can break packages that depended on current non-Node quirks** -> Mitigation: constrain changes to Node-parity paths, add regression coverage, and document intentional deltas.
- **[Risk] Metadata-aware classification adds filesystem lookups and complexity** -> Mitigation: cache package metadata lookups per execution context and keep resolution logic centralized.
- **[Risk] Dynamic import fallback narrowing may surface new runtime errors** -> Mitigation: make errors deterministic and expand tests to lock expected outcomes.
- **[Risk] Resolver behavior changes can affect both CJS and ESM paths simultaneously** -> Mitigation: add paired tests for `require`, `import`, and helper APIs for the same fixture packages.
