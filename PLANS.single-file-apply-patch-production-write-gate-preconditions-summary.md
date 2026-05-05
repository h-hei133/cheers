# single-file apply_patch production write gate preconditions summary

## Phase result

The production write gate preconditions phase is complete at contract-only
level:

1. explicit permission UX path contract
2. final stale-read revalidation before write contract
3. writer boundary proof contract

## Current decision

Do **not** enter production write wiring yet.

The current production `apply_patch` and unified diff rejection behavior must
remain unchanged until a separately approved phase reopens production wiring.

## Preconditions proven

- Permission cannot be inferred from prompt keywords or bare metadata.
- Requested approval does not authorize a write intent.
- Final stale-read revalidation compares current content/digest against
  approval-bound base evidence.
- Stale or missing targets keep the writer unreachable.
- Unsupported operations including multi-file/add/delete/move remain outside the
  route.
- Even when contract prerequisites pass, writer remains unreachable because
  production wiring is not approved.

## Still blocked before production write

- Real CLI/session/runtime permission UX is not wired.
- Production resultMapper/sessionRuntime wiring is not approved.
- Writer invocation path is not approved.
- Production `apply_patch` / unified diff rejection is still required.
- Real-provider production write coverage is not meaningful until a write path is
  separately approved and implemented.

## Required next review

Run a new `$deep-interview` before any route that requires:

- modifying CLI / SessionManager / runMvpIntegratedFlow
- modifying resultMapper.ts / sessionRuntime.ts production logic
- calling or importing the writer for runtime use
- changing production `apply_patch` / unified diff rejection
- supporting multi-file/add/delete/move/AST/fuzzy/rollback
- running a real provider or reading `/home/wang/.private-agents-real`
