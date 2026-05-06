# single-file apply_patch real provider permission UX no-write gate

## Decision

Add an explicit opt-in real-provider smoke for the single-file `apply_patch`
permission UX route.

The smoke reuses the existing real-provider apply_patch preview fixture and
model-turn infra, then routes the generated preview through pending, denied,
and blocked permission UX projections without writing.

## Boundary

The gate requires:

- explicit `PRIVATE_AGENTS_REAL_HOME`
- isolated `HOME`, `USERPROFILE`, and `PRIVATE_AGENTS_TEST_ROOT`
- provider readiness preflight
- synthetic permission UX integration already passing
- redaction pass
- repository clean before and after
- fixture unchanged before and after

It proves:

- `pendingStatus=pending`
- `deniedStatus=denied`
- `blockedStatus=blocked`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `noAppliedPatchRecord=true`
- terminal/session output does not claim write success

## Explicit non-goals

- No writer invocation.
- No production write wiring.
- No approval-to-write authorization.
- No default release/CI gate.
- No auth core or provider changes.
- No CLI, SessionManager, `runMvpIntegratedFlow`, resultMapper, or
  sessionRuntime production logic changes.
- No multi-file/add/delete/move/AST/fuzzy/rollback support.

## Validation

```bash
rtk git status --short
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticPermissionUxIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRealProviderPermissionUxGate.test.ts
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-real-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-real-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-provider-readiness.mjs --preflight-only
rtk proxy env HOME=/tmp/private-agents-test/apply-patch-real-gate-home USERPROFILE=/tmp/private-agents-test/apply-patch-real-gate-home PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/apply-patch-real-gate PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real node scripts/verify-real-user-capabilities.mjs --real-apply-patch-permission-ux-smoke
rtk git status --short
```

## Failure attribution

- provider failure: readiness/model turn/network/auth/model failure
- route failure: generated preview cannot enter the opt-in dry-run route
- permission UX failure: pending/denied/blocked collapse or leak write readiness
- redaction failure: provider output leaks secrets or real provider config paths
- unexpected write: fixture or repository changes, or write-like state appears
- unexpected success claim: terminal/session reports permission UX as write
  success

## Phase boundary

Passing this gate still does not open production write. The next phase must be a
separate production write decision review or explicit permission UX production
wiring review.

## Outcome

Status: `passed`

The explicit opt-in real-provider permission UX smoke command was executed with
isolated runtime/test home and explicit `PRIVATE_AGENTS_REAL_HOME`.

Sealed evidence from the smoke report:

- `status=PASS`
- `statusDetail=passed`
- `realProviderExecution=true`
- `modelTurn=true`
- `noWriteMode=true`
- `fixture.noMutation=true`
- `repositoryClean=true`
- `pendingStatus=pending`
- `deniedStatus=denied`
- `blockedStatus=blocked`
- `terminalClassification=stopped`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `noAppliedPatchRecord=true`
- `terminalNoSuccessClaim=true`
- `redaction.ok=true`

Production write remains blocked.
