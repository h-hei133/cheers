# Single-file Apply Patch Terminal-safe Result Surface Contract

## Goal

Add a contract-only terminal-safe projection for the explicit opt-in single-file `*** Update File` apply_patch dry-run route. The surface must make dry-run, stale-read blocked, and permission-pending states visible without ever claiming a file was written.

## Boundary

This route lives at the patch result layer only. It composes existing dry-run, stale-read, base-evidence, and permission metadata binding contracts into a user-visible-safe shape.

It does not connect CLI, SessionManager, sessionRuntime, resultMapper, runMvpIntegratedFlow, provider/auth, real-provider scripts, default gates, or any production writer.

## Terminal-safe Surface

The surface may expose:

- `status="dry-run-ready" | "blocked" | "permission-pending"`
- `terminalResultVisible=true`
- `willWrite=false`
- `changedFiles=[]`
- `wouldChangeFiles` / `previewChangedFiles` for preview targets
- `writeIntents=[]`
- `approval.decision="pending" | "blocked" | "denied"`
- `approval.writeIntent.authorized=false`
- `approval.writeIntent.count=0`
- digest-only `baseEvidence`
- stale-read precondition metadata
- no-write/no-success proof
- actionable `nextAction` / `doNext`

The surface must not expose `baseContent`, `approved`, `write-success`, `production-write-ready`, non-empty `changedFiles`, or non-empty `writeIntents`.

## State Semantics

- dry-run preview only -> `dry-run-ready`
- dry-run ready + stale-read contract-ready + pending approval -> `permission-pending`
- stale-read blocked, target missing, unsupported patch, denied approval, or blocked approval -> `blocked`

Only an actual future writer path may produce a mutation success result; this route is explicitly not that path.

## Open-source Boundary Absorption

From Claude Code and Opencode, this route absorbs only the boundary idea that preview, permission, blocked, and write-success are distinct result layers, and that permission metadata should not be confused with terminal mutation success. It does not absorb their full edit systems, apply_patch engines, fuzzy matching, rollback, AST patching, multi-file behavior, or runtime architecture.

## Acceptance

Focused tests must prove:

- dry-run-ready, blocked, and permission-pending surfaces are expressible.
- none of those states can surface write-success, production-write-ready, or approved.
- `changedFiles` and `writeIntents` stay empty.
- preview target paths remain only in `wouldChangeFiles` / `previewChangedFiles`.
- no-write proof includes `willWrite=false`, empty changed/write intents, `noWriterInvoked=true`, and `doesNotClaimWriteSuccess=true`.
- base evidence exposes only digest metadata, not base content.
- stale-read and target-missing blockers return actionable next actions.
- permission metadata binding and evidence-chain tests still pass.
- current production apply_patch / unified diff rejection remains unchanged.

## Follow-up Gate

Production write remains blocked after this contract. A future route may evaluate resultMapper/sessionRuntime dry-run projection only after this terminal-safe surface is stable; production write decision still requires explicit permission UX, final stale-read revalidation, writer boundary proof, and unchanged production rejection until intentionally changed.
Follow-up: resultMapper/sessionRuntime bridge projection is tracked in `PLANS.single-file-apply-patch-resultmapper-sessionruntime-bridge-contract.md`.
