# single-file apply_patch pre-production blocker summary

## Phase result

The single-file `apply_patch` runtime/result surface integration phase is
sealed through contract-only coverage.

Completed chain:

1. dry-run production wiring contract
2. stale-read revalidation contract
3. dry-run stale evidence chain contract
4. permission metadata binding contract
5. terminal-safe result surface contract
6. runtime bridge contract
7. resultMapper consumer contract
8. sessionRuntime display contract

This phase proves that dry-run previews, stale-read blockers, permission
pending states, mapper/runtime projections, and display-safe surfaces can stay
non-mutating and non-success-like until a real writer boundary is deliberately
introduced.

## Current decision

Do **not** enter production write decision gate yet.

Production `apply_patch` and unified diff inputs must continue to be rejected in
the mutation lane until a separately approved production-write phase closes the
remaining blockers below.

## Required blockers before production write

### 1. Explicit permission UX path is not wired

The contracts can express permission metadata and pending/blocked decisions, but
no production user approval path is wired for single-file `apply_patch`.

Required before write:

- user-visible permission prompt path
- approval metadata bound to base evidence
- denial/blocked display behavior
- proof that approval cannot be inferred from prompt text

### 2. Final stale-read revalidation is not in the production path

The stale-read helper proves the contract, but the production path does not yet
perform a final read/digest comparison immediately before write.

Required before write:

- final read at write-decision time
- digest comparison against dry-run base evidence
- stale-read / target-missing hard block
- no writer invocation after failed revalidation

### 3. Writer boundary proof is not established

No writer boundary has been introduced for this route. Existing helpers remain
dry-run/contract-only and continue to report `willWrite=false`.

Required before write:

- explicit writer entry point and ownership boundary
- proof that only approved, revalidated single-file update operations can reach it
- proof that multi-file/add/delete/move remain outside this route
- failure behavior that cannot be displayed as mutation success

### 4. resultMapper/sessionRuntime real wiring is not approved

ResultMapper consumer and sessionRuntime display contracts exist only as
patchResult-layer projections/tests. Production resultMapper/sessionRuntime
logic has not been modified and should not be changed without a new review.

Required before write:

- approved plan for production mapping/display integration
- proof that runtime consumes safe projections, not raw permission metadata
- proof that success-like display appears only after real write completion

### 5. Production rejection behavior must remain

The current mutation lane must continue rejecting production `apply_patch` and
unified diff inputs.

Required before write:

- explicit approval to relax this rejection for the single-file route only
- regression proof that unsupported patch shapes still reject
- regression proof that this does not open multi-file or broader patch support

### 6. Real-provider tests cannot cover production write yet

Real-provider coverage cannot validate production `apply_patch` writes because
the write path is intentionally not wired.

Required before write:

- production write path exists behind explicit permission and stale-read gates
- isolated fixture-only real-provider smoke can exercise the path safely
- redaction and provider-home isolation remain intact

## Conditions that require a new deep review

Run a new `$deep-interview` before proceeding if the next route requires any of:

- modifying `packages/ts-shell/src/core/query/resultMapper.ts`
- modifying `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- wiring CLI or `runMvpIntegratedFlow`
- introducing a production writer call
- running a real provider
- reading `/home/wang/.private-agents-real`
- changing production `apply_patch` / unified diff rejection behavior
- expanding scope to full edit system, AST/fuzzy patching, multi-file support,
  add/delete/move, or rollback

## Next-stage candidates

The safest next-stage candidates are:

1. permission UX path design/review for the single-file route
2. final stale-read revalidation placement review for a production write path
3. writer boundary proof plan
4. production resultMapper/sessionRuntime wiring review

The next stage should still begin with `$deep-interview` unless it is explicitly
limited to documentation or contract-only verification.

## Validation for this seal

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperConsumer.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSessionRuntimeDisplay.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Pointer: explicit permission UX contract

See `PLANS.single-file-apply-patch-explicit-permission-ux-contract.md` for the
contract-only explicit permission UX path. It proves approval cannot be inferred
from prompt text or bare metadata, and that requested approval still does not
authorize a write intent before final stale-read and writer-boundary contracts.
