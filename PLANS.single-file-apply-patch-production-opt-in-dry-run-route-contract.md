# single-file apply_patch production opt-in dry-run route contract

## Decision

Add a production-adjacent opt-in dry-run route seam for the single-file
`apply_patch` route.

This step does not modify CLI, SessionManager, `runMvpIntegratedFlow`,
`resultMapper.ts`, `sessionRuntime.ts`, provider/auth core, release gates, or
the writer. Default production `apply_patch` and unified diff rejection remains
unchanged.

## Boundary

The route accepts:

- `workspaceRoot`
- `rawPatchText`
- `readFile`
- `dryRun=true`
- `explicitOptIn=true`
- optional requested user decision for permission UX contract projection

Without `explicitOptIn=true`, the route returns `status="rejected"` and does
not call `readFile`, dry-run parsing, stale-read, permission UX, mapper, session
runtime, or writer logic.

## Contract

When explicitly opted in, the route composes the existing no-write chain:

1. dry-run parse / verify
2. digest-only base evidence
3. stale-read revalidation for the dry-run write-decision phase
4. permission UX metadata projection
5. terminal-safe result surface
6. runtime bridge
7. resultMapper consumer seam
8. resultMapper safe seam
9. sessionRuntime display seam

The route emits only:

- `status="dry-run-ready" | "blocked" | "permission-pending"`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- no applied patch record
- no mutation success
- no write success

Requested approval can prepare permission UX evidence, but it does not authorize
a write intent and does not make the route production-write-ready.

## Required Proofs

- Non-opt-in calls stay rejected and do not enter dry-run.
- Explicit opt-in reaches the safe dry-run/session seam chain.
- Permission-pending remains non-success and no-write.
- Stale-read blocks before any writer reachability.
- Unsupported patch shapes stay blocked with no changed files or write intents.
- Default production replace lane still rejects `apply_patch` and unified diff
  payloads.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchOptInDryRunRoute.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSessionRuntimeSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next Step

Proceed to synthetic production-adjacent dry-run integration. Real provider
gate remains blocked until the synthetic route validation passes.
