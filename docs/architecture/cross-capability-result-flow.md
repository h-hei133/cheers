# Cross-Capability Result Flow

Route: `docs/agent-routes/route162-cross-capability-result-flow.md`

## Scope

Route 162 calibrated three existing stopped/result flows without adding
provider calls, browser execution, edit/write behavior, session schema changes,
CLI behavior, dependencies, or a global handoff abstraction.

Touched facades:

- `core/query/actionableBlockerModule.ts`
- `core/context/browserTxn.ts`
- `orchestration/editPatchResult.ts`
- `core/query/crossCapabilityResultFlow.test.ts`

## Provider Flow

Before: provider readiness facts could reach Result Surface as safe reason text
or `provider-readiness:*` evidence, but `resultMapper` treated not-configured
cases mostly through generic insufficient-evidence/stopped logic.

After: Result Surface recognizes provider-specific stopped markers for:

- `provider-readiness:missing-key`
- `provider-readiness:missing-config`
- `provider-readiness:unsupported-provider`
- explicit provider opt-in required text

Preserved:

- no live provider call
- no real-provider config read
- no provider config path or secret projection
- network/auth unknown hard failures outside these preconditions remain hard
  failures under the existing truthfulness order

## Browser Flow

Before: unavailable, policy, timeout, target-missing, and adapter-failure
browser facts already mapped to actionable stopped paths; cleanup failure was
folded into adapter failure.

After: cleanup failure has its own Result Surface marker:

- `actionable-blocker-kind:browser-cleanup-failed`

Browser timeout/cleanup facts continue to flow through Runtime receipt
projection for transcript-safe summaries. Raw DOM/page content, cookies,
storage, screenshots/OCR-like content, and secrets remain excluded.

## Edit Flow

Before: missing target and stale-read blockers had established markers in some
write-path projections, while the Edit / Patch module stopped projection did
not consistently emit markers for missing target, missing content, or
future-only edit states.

After: `editPatchResult` emits no-write actionable markers for existing
precondition/future states:

- `patch-target-missing`
- `patch-content-missing`
- `stale-read`
- `unsupported-future-edit`

Preserved:

- writer is not invoked by the module projection
- changed files remain empty for these stopped module states
- workspace authority and stale-read behavior are unchanged
- broad refactor, discovery edit, and fenced replacement remain future-only
  or precondition states

## Result States Preserved

- completed paths were not introduced for stopped failures
- provider/browser/edit stopped states still map through `stopped_error`
- unknown hard failures still classify as `error`
- capability-specific markers are inputs to Result Surface only; they do not
  authorize execution

## Validation

Focused route validation:

- `rtk npm run test -w packages/ts-shell -- src/core/query/crossCapabilityResultFlow.test.ts src/core/query/resultMapperBoundary.test.ts src/orchestration/editPatchModule.test.ts`

Additional required gates are recorded in the route closeout report.
