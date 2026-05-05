# Single-file Apply Patch Dry-run Stale Evidence Chain Contract

## Goal

Connect the existing single-file `*** Update File` dry-run contract with the stale-read revalidation contract by carrying audit-safe base evidence from dry-run preview into write-decision dry-run revalidation.

This remains contract-only. It does not enable production apply_patch writes.

## Contract Boundary

The dry-run result captures base evidence for the target content used during preview/verification:

- `targetPath`
- `baseDigest`
- `digestAlgorithm="sha256"`
- `capturedAtPhase="dry-run-preview"`
- `source="verify-readFile"`

The base evidence intentionally does not expose `baseContent`. Future permission metadata can bind approval to this digest without surfacing the target file content.

## Evidence Chain

1. The dry-run helper parses and verifies one `Update File` patch.
2. The verified target content used for preview is digested into `baseEvidence`.
3. A later stale-read dry-run revalidation compares the current target digest against `baseEvidence.baseDigest`.
4. Matching digest returns `status="contract-ready"` but still not production-write-ready.
5. Changed digest returns `status="blocked"` with `blocker="stale-read"`.
6. Missing target returns `status="blocked"` with `blocker="target-missing"`.

All outcomes keep:

- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`

## Non-goals

- Do not connect production write.
- Do not call the single-file update writer.
- Do not modify CLI, SessionManager, sessionRuntime, runMvpIntegratedFlow, provider/auth core, real-provider scripts, or release/default gates.
- Do not change the current production rejection of apply_patch / unified diff shapes.
- Do not support multi-file, add, delete, move, rollback, fuzzy patch, AST patch, or a full apply_patch engine.
- Do not run real provider smoke or read real provider configuration.

## Acceptance

Focused tests must prove:

- dry-run result carries `baseEvidence`.
- `baseEvidence` contains target path, SHA-256 digest, phase, and source.
- dry-run result does not expose `baseContent`.
- unchanged current content can revalidate from dry-run base evidence as contract-ready.
- changed current content blocks as stale-read.
- missing current content blocks as target-missing.
- dry-run no-write and stale-read no-write proofs remain intact.
- production apply_patch / unified diff rejection remains unchanged.

## Follow-up Gate

The next route may evaluate permission metadata binding to `baseEvidence`. It must not proceed to write wiring until approval, stale-read, result/session surface, and final writer boundary are proven together.
