# single-file apply_patch real provider dry-run gate outcome

## Outcome

Status: `attempted/blocked`

The explicit opt-in real-provider apply_patch dry-run smoke command now exists
and was executed. The smoke did not reach a completed apply_patch dry-run route
because the provider model turn failed with a network-attributed provider
failure.

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

Actual smoke attempted:

```bash
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-real-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-real-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-real-user-capabilities.mjs --real-apply-patch-dry-run-smoke
```

## Evidence

The actual smoke report recorded:

- `status=PROVIDER_NETWORK`
- `statusDetail=provider-network-inconclusive`
- `failureCategory=provider-network-inconclusive`
- `failureReason=provider-readiness:network: provider endpoint was unreachable during this turn`
- `realProviderExecution=true`
- `modelTurn=true`
- `noWriteMode=true`
- `fixture.noMutation=true`
- `repositoryClean=true`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `redaction.ok=true`

The redacted output tail was:

```text
{"provider":"openai-compatible","kind":"network","message":"fetch failed","retriable":true,"cause":{}}
```

## Boundary

Production single-file `apply_patch` remains blocked:

- writer remains unreachable
- production write remains disabled
- default production `apply_patch` and unified diff rejection remain unchanged
- this outcome does not validate a successful provider-facing dry-run preview
- retrying the same smoke is appropriate only when the provider endpoint is reachable
