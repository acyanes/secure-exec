## Context

secure-exec currently treats host `node_modules` access as an opt-in projection path (`moduleAccess`) that discovers an allowlisted dependency closure and maps it into `/app/node_modules`. Module loading still has runtime branches for "filesystem available" vs "filesystem unavailable", and callers can hit import failures when they did not mount a filesystem exactly as expected.

The requested behavior is to treat `node_modules` as a stable runtime overlay: sandbox code should always be able to load dependencies from a read-only `/app/node_modules` view sourced from host `<cwd>/node_modules`, independent of base filesystem mounting.

## Goals / Non-Goals

**Goals:**
- Always expose `/app/node_modules` as a read-only overlay in Node runtime.
- Keep strict security boundary: every overlay read must remain contained under canonicalized `<cwd>/node_modules`.
- Make overlay availability independent of base filesystem presence or mount location.
- Simplify runtime import loading paths to rely on one shared `VirtualFileSystem` interface.
- Preserve non-overlay deny-by-default behavior and read-only write denial under `/app/node_modules`.

**Non-Goals:**
- Supporting non-`node_modules` package manager modes (for example PnP).
- Allowing writes/mutations under `/app/node_modules`.
- Expanding host filesystem visibility beyond `<cwd>/node_modules`.
- Adding host-global fallback module resolution.

## Decisions

### Decision: Replace allowlist closure projection with a scoped node_modules overlay
- Introduce an always-on overlay filesystem mapping:
  - virtual root: `/app/node_modules`
  - host root: `<cwd>/node_modules` (default `<cwd> = process.cwd()` unless explicitly overridden by runtime option)
- For every overlay path operation, canonicalize target host path and enforce `realpath(hostTarget)` containment under canonical `realpath(<cwd>/node_modules)`.
- Keep synthetic virtual dirs (`/`, `/app`, `/app/node_modules`) available even when no base filesystem exists.

Rationale:
- Removes discovery complexity (`allowPackages`, transitive closure crawl) for default behavior.
- Guarantees deterministic import availability from installed dependencies.
- Preserves strict containment and escape resistance.

Alternatives considered:
- Keep explicit allowlist projection as required config: rejected due to operational friction and branching complexity.
- Full host filesystem passthrough: rejected due to trust-boundary expansion.

### Decision: Make overlay read-only at filesystem boundary
- Deny `writeFile`, `mkdir`, `remove*`, and `rename` for `/app/node_modules/**` in overlay filesystem implementation.
- Read-like operations (`readFile`, `readDir`, `stat`, `exists`) remain allowed for overlay paths.

Rationale:
- Prevents sandbox package tampering.
- Keeps module-loading behavior stable across runs.

Alternatives considered:
- Permission-only enforcement without filesystem hard-stop: rejected because policy bypasses become easier when wrappers change.

### Decision: Use one runtime filesystem interface for import resolution
- Node runtime module loading (`require`, ESM resolution/classification, dynamic import) always uses the resolved driver filesystem interface.
- Remove special-case "filesystem disabled" checks in import resolution branches; the overlay-backed filesystem exists for Node runtime even without a base filesystem.

Rationale:
- Simplifies resolver/control flow and removes split behavior.
- Improves determinism for module-loading paths.

Alternatives considered:
- Keep dual paths (stub/no-fs + projection path): rejected as unnecessary complexity once overlay is always present.

## Risks / Trade-offs

- [Risk] Broadening default readable package surface from allowlist to full `<cwd>/node_modules` may expose more third-party source to sandbox code -> Mitigation: enforce strict root containment, keep read-only policy, and document trust-boundary implications in security docs.
- [Risk] Symlink-heavy installs could trigger containment false positives/edge cases -> Mitigation: canonicalize both root and target paths with deterministic out-of-scope errors.
- [Risk] Existing callers depending on `moduleAccess.allowPackages` scoping semantics may lose least-privilege behavior -> Mitigation: document as breaking behavior; optionally follow up with explicit scoped-overlay mode if needed.
- [Risk] Overlay root missing on host (`<cwd>/node_modules` absent) could change failure mode timing -> Mitigation: expose deterministic module-not-found behavior and clear driver/runtime setup errors where applicable.

## Migration Plan

1. Add always-on node_modules overlay filesystem wrapper in Node driver construction.
2. Refactor/retire allowlist-closure discovery code paths replaced by root-scoped overlay mapping.
3. Update runtime module-loading flow to rely on one filesystem interface and remove no-filesystem module-loading branches.
4. Add targeted tests for:
   - no-base-filesystem import success from overlay,
   - base-filesystem-mounted-elsewhere overlay import success,
   - path-escape exploit rejection,
   - read-only mutation denial under overlay.
5. Update compatibility/friction/security docs for new trust-boundary and behavior contract.

Rollback:
- Reintroduce optional gated behavior (previous `moduleAccess` projection path) behind a temporary compatibility flag if regressions are discovered.

## Open Questions

- Should we keep a compatibility alias for `moduleAccess.cwd`, or require a new dedicated overlay option surface?
- Do we need a follow-up "scoped overlay" mode for least-privilege environments that do not want full `node_modules` readability?
