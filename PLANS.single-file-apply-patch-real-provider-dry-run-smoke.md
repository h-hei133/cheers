# single-file apply_patch real provider dry-run smoke

## Decision

Add an explicit opt-in real-provider smoke for the single-file `apply_patch`
production-adjacent dry-run route.

The smoke is not a production write route. It does not modify CLI,
SessionManager, `runMvpIntegratedFlow`, `resultMapper.ts`, `sessionRuntime.ts`,
provider/auth core, release/default gates, `singleFileUpdateApply.ts`, or writer
code.

## Smoke Shape

The smoke command is:

```bash
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-real-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-real-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-real-user-capabilities.mjs --real-apply-patch-dry-run-smoke
```

It performs one real-provider model turn against an isolated fixture. The model
is asked to produce exactly one `apply_patch` preview block. The smoke then
routes that preview through `buildSingleFileApplyPatchOptInDryRunRoute` with
`explicitOptIn=true` and `dryRun=true`.

## Required Invariants

- real provider execution is explicit opt-in only
- runtime home, audit log, report, and fixture stay under
  `PRIVATE_AGENTS_TEST_ROOT`
- `/home/wang/.private-agents-real` is used only as an explicit config source
- provider config, paths, headers, tokens, and keys are redacted
- fixture snapshot is identical before and after the route
- repository is clean before and after the smoke
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- no applied patch record
- no mutation success or write success claim

## Failure Attribution

The smoke must stop with a specific status for:

- provider readiness / auth / network / model failure
- provider output missing an `apply_patch` block
- provider output containing multiple patch blocks
- route failure
- redaction failure
- unexpected write-like state
- unexpected success claim
- fixture or repository mutation leak

## Validation

```bash
rtk proxy env PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate node scripts/real-provider-apply-patch-dry-run-fixture.mjs --self-test
rtk proxy env PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate node scripts/verify-real-user-capabilities.mjs --real-apply-patch-dry-run-smoke-dry-run
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRealProviderDryRunGate.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticOptInDryRunIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Boundary

Passing this smoke proves only a real-provider no-write preview can reach the
existing opt-in dry-run seam. Production write remains blocked and writer
remains unreachable.
