# Single-file Apply Patch Dry-run Production Wiring

## Goal

Add an explicit opt-in, non-production dry-run path for one `*** Update File` apply_patch payload. The path is production-like only in shape: it composes parse, verify, preview, no-partial, approval metadata, and result/session surface contracts while proving that no file write occurs.

This route directly supports the user-minimal main path by making edit/patch tool boundaries and terminal no-write results explicit before any production write wiring is considered.

## Non-goals

- Do not connect production apply_patch writes.
- Do not change the current production rejection of apply_patch-shaped or unified diff input in the explicit replace lane.
- Do not support multi-file apply_patch.
- Do not support add, delete, move, rollback, fuzzy patch, AST patch, or a full apply_patch engine.
- Do not modify CLI, SessionManager, sessionRuntime, runMvpIntegratedFlow, provider/auth core, real-provider scripts, or release/default gates.
- Do not run real provider smoke or read real provider configuration.

## Implementation Boundary

The dry-run helper lives under `packages/ts-shell/src/orchestration/patchResult/` because it is a terminal-facing preview adapter, not an applicator. It composes existing contracts only:

1. `parseApplyPatchText()`
2. `verifyParsedPatch()` with `supportedOperations: ["update"]`
3. `buildPatchPreview()`
4. `buildNoPartialPatchApplicationContract()`
5. `buildSingleFileUpdatePatchReadinessContract()`
6. `buildSingleFileUpdatePatchApprovalContract()` with pending/blocked decisions only
7. `buildSingleFileUpdatePatchResultSurfaceContract()`

The helper must not import or call the writer path.

## Dry-run Result Contract

A successful dry-run returns `status="dry-run-ready"` and still reports:

- `willWrite=false`
- terminal-facing `changedFiles=[]`
- `wouldChangeFiles` / `previewChangedFiles` for preview targets
- `writeIntents=[]`
- `noWriterInvoked=true`
- `terminalResultVisible=true`
- `doesNotClaimWriteSuccess=true`
- approval decision is `pending`, never `approved`

Blocked paths return `status="blocked"` with the same no-write guarantees and actionable `nextAction` / `doNext`.

## Acceptance

Focused tests must prove:

- single-file `Update File` reaches dry-run-ready
- no terminal changed files are reported
- no write intents are exposed
- no writer is invoked
- preview target files are visible separately from changed files
- multi-file, add, delete, unified diff, missing file, and context mismatch are blocked
- no-partial contract preserves `verify-all-before-write`
- current production apply_patch / unified diff rejection remains unchanged

## Risks and Guards

- Risk: preview `changedFiles` is mistaken for a real mutation. Guard: map preview files to `wouldChangeFiles` / `previewChangedFiles` and force terminal `changedFiles=[]`.
- Risk: approval metadata accidentally authorizes writes. Guard: dry-run uses pending/blocked only and exposes `writeIntents=[]`.
- Risk: dry-run helper drifts into production application. Guard: do not import the writer and keep this route out of CLI/session/runtime wiring.

## P1 Decision Gate

If this route is later expanded, the next decision must be a separate plan for stale-read revalidation, permission UX dry-run surface, and resultMapper/sessionRuntime terminal integration. It must still not jump directly to a write path.

- See `PLANS.single-file-apply-patch-stale-read-revalidation-contract.md` for the P1 stale-read revalidation contract that follows this dry-run route.
