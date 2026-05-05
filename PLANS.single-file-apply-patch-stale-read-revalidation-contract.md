# Single-file Apply Patch Stale-read Revalidation Contract

## Goal

Add a contract-only stale-read revalidation helper for the single-file `*** Update File` apply_patch route. The contract proves that a dry-run preview cannot advance toward any future write decision if the target file content changed after the preview base content was captured.

This is a P1 decision gate after the dry-run production-like helper. It is not production write wiring.

## Non-goals

- Do not connect production apply_patch writes.
- Do not call the single-file update writer.
- Do not modify CLI, SessionManager, sessionRuntime, runMvpIntegratedFlow, provider/auth core, real-provider scripts, or release/default gates.
- Do not support multi-file, add, delete, move, rollback, fuzzy patch, AST patch, or a full apply_patch engine.
- Do not run real provider smoke or read real provider configuration.

## Contract Inputs

The helper receives only write-decision dry-run facts:

- `targetPath`
- `baseContent` captured when the dry-run preview/readiness was produced
- `currentContent` observed before a hypothetical write decision
- `phase="write-decision-dry-run"`
- `dryRun=true`

The first implementation compares content directly instead of introducing digest machinery.

## Result Contract

All outcomes are no-write outcomes:

- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `doesNotClaimProductionWriteReady=true`

If base and current content match, the helper returns `status="contract-ready"`. This does not mean production-write-ready.

If content differs, the helper returns `status="blocked"`, `blocker="stale-read"`, and an actionable re-read/rerun next action.

If current content is missing, the helper returns `status="blocked"`, `blocker="target-missing"`, and an actionable re-read/regenerate next action.

## Relationship to Dry-run Helper

The existing dry-run helper proves parse, verify, preview, no-partial, approval metadata, and terminal no-write result shape. This stale-read helper proves that the preview base content still matches the target before any later write decision can be considered.

The two helpers remain separate in this route. No production orchestration is wired.

## Acceptance

Focused tests must prove:

- unchanged content returns contract-ready but not production-write-ready
- changed content blocks the write decision as stale-read
- missing target blocks the write decision as target-missing
- stale and missing paths keep `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`, and `noWriterInvoked=true`
- existing dry-run no-write contract remains green
- current production apply_patch / unified diff rejection remains green

## Follow-up Gate

A future route may evaluate permission UX dry-run surface or resultMapper/sessionRuntime display. Production write wiring remains blocked until stale-read, permission approval, result surface, and final writer boundary are proven together in a separate plan.

- See `PLANS.single-file-apply-patch-dry-run-stale-evidence-chain-contract.md` for the follow-up contract that lets dry-run base evidence drive this stale-read revalidation without exposing base file content.
