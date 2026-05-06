# single-file apply_patch result/session safe wiring summary

## Phase Result

The single-file `apply_patch` result/session safe wiring phase is complete at
seam level:

1. mapper-safe production seam contract
2. sessionRuntime display seam contract
3. blocker summary for future production wiring

This phase proves future production result/display wiring can consume safe seam
outputs without accepting raw permission metadata, raw base content, raw writer
boundary objects, applied patch records, changed files, write intents, or
mutation-success markers.

## Current Decision

Do **not** enter production write wiring yet.

Production `apply_patch` and unified diff inputs must continue to be rejected in
the mutation lane until a separately approved production-write phase changes
that behavior.

## What Is Now Proven

- ResultMapper-facing seam input is limited to mapper-safe consumer output.
- SessionRuntime-facing seam input is limited to mapper seam output.
- Dry-run, blocked, and permission-pending states remain non-success-like.
- Preview targets stay in attempted / would-change / preview fields, never
  `changedFiles`.
- `willWrite=false`, `changedFiles=[]`, and `writeIntents=[]` are preserved.
- No writer is invoked.
- No applied patch record is displayed.
- No mutation success, write success, permission grant, or production-write-ready
  marker is surfaced.
- Actionable `nextAction` and `doNext` are preserved.

## Still Blocked Before Production Wiring

- Real CLI / runMvp route is not wired for this apply_patch path.
- Production `resultMapper.ts` logic has not been modified.
- Production `sessionRuntime.ts` logic has not been modified.
- Provider-facing permission UX is not wired.
- Final stale-read revalidation is not placed in a production route.
- Writer invocation is not approved.
- Production write gate remains closed.

## Conditions For Touching Production Files

Modify `packages/ts-shell/src/core/query/resultMapper.ts` only after a separate
review approves production mapper wiring and proves the input is the
resultMapper seam output, not raw contract metadata.

Modify `packages/ts-shell/src/core/shell/sessionRuntime.ts` only after a
separate review approves production display wiring and proves the input is the
sessionRuntime seam output or mapped safe result, not raw permission metadata or
writer boundary objects.

Modify CLI, SessionManager, or `runMvpIntegratedFlow.ts` only after a separate
route wiring review. Seam/helper/test work is no longer sufficient if the next
step needs entrypoint wiring, durable state changes, or orchestration
sequencing.

## Required Re-review Triggers

Pause and re-review before any work that requires:

- modifying production resultMapper or sessionRuntime logic
- modifying CLI, SessionManager, or `runMvpIntegratedFlow`
- importing or calling the writer
- changing production `apply_patch` / unified diff rejection
- supporting multi-file/add/delete/move/AST/fuzzy/rollback
- running a real provider
- reading `/home/wang/.private-agents-real`
- surfacing changed files, applied patch, write success, mutation success, or
  production-write-ready markers for this route

## Real Provider Gate Policy

No real provider gate is needed for this seam-only phase.

A real provider gate becomes required if the next phase enters a production
opt-in dry-run route, provider-facing permission UX path, production write gate,
or release/merge readiness. That gate must be explicit opt-in, isolated to a
fixture, no-write or temporary-fixture-only, redaction-checked, and must not
read, print, copy, modify, clean, or commit `/home/wang/.private-agents-real`.

## Next-Stage Candidates

1. production opt-in dry-run route phase
2. explicit permission UX real wiring phase

Both require a fresh review before implementation. Production write remains out
of scope until those routes prove safe result/session consumption and final
stale-read placement.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSessionRuntimeSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```
