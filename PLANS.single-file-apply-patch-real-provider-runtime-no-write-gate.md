# Single-file apply_patch real-provider runtime no-write gate

## Scope

Step 3 adds an explicit real-provider smoke for the runtime no-write route. The
smoke reaches the real provider path, extracts one apply_patch preview, and feeds
it into the runtime no-write seam. It does not call a writer and does not permit
production writes.

## Gate Conditions

- `PRIVATE_AGENTS_REAL_HOME` must be set explicitly.
- `HOME`, `USERPROFILE`, and `PRIVATE_AGENTS_TEST_ROOT` must point to isolated
  temporary directories.
- Provider readiness preflight must pass before the model turn.
- Provider output is redacted before route processing or reporting.
- The isolated fixture must remain unchanged.
- Repository pre/post status must remain clean.

## Acceptance

- `routeStatus=permission-pending` or another stopped no-write route status.
- `displayStatus=permission-pending`, `denied`, or `blocked`.
- `terminalClassification=stopped`.
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`.
- `noWriterInvoked=true`, `noAppliedPatchRecord=true`.
- `terminalNoSuccessClaim=true`.
- `redaction=pass`, `fixtureUnchanged=true`, `repositoryClean=true`.

## Validation

- `rtk git status --short`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/syntheticRuntimeNoWrite.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/runtimeNoWriteSmoke.test.ts`
- `rtk proxy env HOME=/tmp/private-agents-test/apply-patch-runtime-no-write-home USERPROFILE=/tmp/private-agents-test/apply-patch-runtime-no-write-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-runtime-no-write PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-provider-readiness.mjs --preflight-only`
- `rtk proxy env HOME=/tmp/private-agents-test/apply-patch-runtime-no-write-home USERPROFILE=/tmp/private-agents-test/apply-patch-runtime-no-write-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-runtime-no-write PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-real-user-capabilities.mjs --real-apply-patch-runtime-no-write-smoke`
- `rtk git status --short`

## Failure Attribution

- Provider readiness/network failures are provider failures, not route failures.
- Missing or multiple apply_patch blocks are provider-output failures.
- Redaction leak, fixture mutation, repo mutation, writer reachability, or success
  claim each stop the gate immediately.
