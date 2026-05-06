# single-file apply_patch real provider dry-run gate outcome

## Outcome

Status: `passed`

The explicit opt-in real-provider apply_patch dry-run smoke command now exists
and was executed. On retry, the real provider produced exactly one single-file
`apply_patch` preview block, and that preview passed through the explicit
opt-in dry-run route without writing.

This is not a production write pass and does not open the production write gate.

## Commands Run

Synthetic and contract prerequisites passed:

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticOptInDryRunIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRealProviderDryRunGate.test.ts
```

Real-provider readiness preflight passed with explicit real-provider opt-in:

```bash
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-real-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-real-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-provider-readiness.mjs --preflight-only
```

Actual smoke passed:

```bash
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-real-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-real-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-real-user-capabilities.mjs --real-apply-patch-dry-run-smoke
```

## Evidence

The actual smoke report recorded:

- `status=PASS`
- `statusDetail=passed`
- `failureCategory=none`
- `realProviderExecution=true`
- `modelTurn=true`
- `noWriteMode=true`
- `fixture.noMutation=true`
- `repositoryClean=true`
- `routeStatus=permission-pending`
- `displayStatus=permission-pending`
- `terminalClassification=stopped`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `noAppliedPatchRecord=true`
- `terminalNoSuccessClaim=true`
- `redaction.ok=true`

The redacted output tail was the generated preview:

```text
*** Begin Patch
*** Update File: src/app.ts
@@
-status: draft
+status: ready
*** End Patch
```

## Boundary

Production single-file `apply_patch` remains blocked:

- writer remains unreachable
- production write remains disabled
- default production `apply_patch` and unified diff rejection remain unchanged
- this outcome validates only a provider-facing non-mutating dry-run preview
- it does not validate production write, writer invocation, or production
  resultMapper/sessionRuntime wiring
