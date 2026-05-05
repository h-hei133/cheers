# Single-file Apply Patch Permission Metadata Binding Contract

## Goal

Bind single-file `*** Update File` approval metadata to the dry-run base evidence and declare the stale-read precondition that must pass before any future write decision can be considered.

This remains a contract-only route. It does not enable production apply_patch writes.

## Contract Boundary

Approval metadata may carry:

- `baseEvidence.targetPath`
- `baseEvidence.baseDigest`
- `baseEvidence.digestAlgorithm="sha256"`
- `baseEvidence.capturedAtPhase="dry-run-preview"`
- `baseEvidence.source="verify-readFile"`
- `staleReadPrecondition.required=true`
- `staleReadPrecondition.phase="write-decision-dry-run"`
- `staleReadPrecondition.requiredBefore="write-decision"`
- `staleReadPrecondition.blocksWriteOn=["stale-read","target-missing"]`

The metadata must not expose `baseContent`.

## Decision Semantics

- Stale-read `contract-ready` keeps approval `pending`, never `approved`.
- Stale-read `blocked` with `blocker="stale-read"` forces approval `blocked`.
- Stale-read `blocked` with `blocker="target-missing"` forces approval `blocked`.
- Bound approval metadata keeps `writeIntent.authorized=false` and `writeIntent.count=0`.

## Non-goals

- Do not connect production writes.
- Do not call the single-file update writer.
- Do not modify CLI, SessionManager, sessionRuntime, runMvpIntegratedFlow, provider/auth core, real-provider scripts, or release/default gates.
- Do not change the current production rejection of apply_patch / unified diff shapes.
- Do not support multi-file, add, delete, move, rollback, fuzzy patch, AST patch, or a full apply_patch engine.
- Do not run real provider smoke or read real provider configuration.

## Acceptance

Focused tests must prove:

- approval metadata includes base evidence fields and stale-read precondition fields.
- approval metadata does not include base content.
- stale-read contract-ready cannot produce an approved bound approval.
- stale-read stale/missing blockers force blocked approval.
- write intent remains unauthorized with count zero.
- dry-run no-write contract remains intact.
- production apply_patch / unified diff rejection remains intact.

## Follow-up Gate

Production write remains blocked. A future route may evaluate result/session surface binding or an explicit write decision gate, but only after approval metadata, stale-read, terminal result, and final writer boundary are proven together.
