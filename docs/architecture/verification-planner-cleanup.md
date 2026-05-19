# Verification Planner Cleanup

Route: `docs/agent-routes/route141-verification-planner.md`

## Scope

Route 141 repaired the verification planning/result cluster without provider,
browser, edit-capability, shell allowlist, schema, CLI, dependency, or broad
`runMvpIntegratedFlow.ts` expansion.

Starting full runMvp baseline: `111 passed / 40 failed`.

Current full runMvp baseline after this route: `112 passed / 39 failed`.

## Reference Scan

Bounded reference scan was shape-only:

- Inspect AI scorer/event surfaces keep scores/results as explicit events rather
  than implicit task success.
- opencode plugin loading reports skipped/missing/error cases with explicit
  retry context instead of merging them into success.
- Claude Code query/tool-result flow keeps retry transitions and tool-result
  matching explicit so failed/retried work does not leave orphan outcomes.

No reference implementation code was copied.

## Contract

- `passed`: selected verification ran and succeeded.
- `failed`: selected verification ran and failed; failed command verification
  may retry once when the failure is not a policy/blocker failure.
- `blocked`: selected verification could not run because approval, missing
  command, environment, or policy blocked it.
- `skipped`: verification was selected, but no supported current-contract
  verification route applies; skipped mutation verification is terminally
  recoverable/stopped, not plain success.
- `not-requested`: no verification was selected or required, including no-write
  read/inspect tasks.
- `unavailable`: planner-only state for unsupported explicit verify commands;
  current result schema projects this as skipped with an allowlist/blocker
  reason instead of adding a schema value.

Retry result codes are explicit:

- `retry-planned:command-failed-retryable`
- `retry-not-planned:passed`
- `retry-not-planned:blocked`
- `retry-not-planned:attempts-exhausted`
- `retry-not-planned:not-selected`

## Targeted Failure Decisions

| Test | Classification | Decision |
|---|---|---|
| auto-selects focused verify for test-only edits without explicit verify command | product behavior drift | fixed; path tokens no longer make `.test.ts` look like explicit verify intent, and auto verification selects `node --version` with focused scope |
| auto-selects broader verify for source edits without explicit verify command | product behavior drift | fixed; source edits select allowlisted `node --version` with broader scope |
| fails verify only after bounded retry attempts and records repair failure boundary | product behavior drift | fixed; failed command verification retries once and records attempts-exhausted reason |
| skips targeted verify with explicit reason when changed files do not map to allowlisted verify commands | stale terminal expectation + product clarity | rebaselined to `skipped` verification with recoverable `stopped_error` terminal classification |
| runs low-risk multi-file consistency verification after a file edit | product behavior drift | fixed by ignoring verification-tail paths during single mutation target selection |
| keeps multi-file consistency source separate from append target | product behavior drift | fixed; verification source file is read for consistency but not mutated |
| fails low-risk multi-file consistency verification when target misses source item | stale terminal expectation | rebaselined to recoverable `stopped`, preserving failed verification status and reason |
| applies a user correction to the derived file and re-verifies consistency | obsolete edit-planning expectation | rebaselined to current blocker; route did not expand broad correction parsing |
| writes action result seed from execution result for next-turn continuity | stale verification seed expectation | rebaselined to explicit `node --version` passed seed with verified file |

## Implementation Notes

New focused owners:

- `packages/ts-shell/src/orchestration/verificationPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationResultProjection.ts`
- `packages/ts-shell/src/orchestration/verificationPlanner.test.ts`

Minimal wiring remains in `runMvpIntegratedFlow.ts` for when verification is
invoked in the workflow. The planner does not run commands.

Result projection now owns:

- passed/failed command verification summaries
- retry evidence
- skipped and not-requested projection
- transcript-safe verify evidence without raw stdout/stderr dumps

## Validation Evidence

- Focused verification planner/runMvp route:
  `19 passed / 142 skipped`
- Full `runMvpIntegratedFlow.test.ts`:
  `112 passed / 39 failed`
- `rtk npm run build -w packages/ts-shell`: pass

Remaining failures are outside this route: approval/transcript harness,
write/concrete-content planning, edit/refactor/batch/discovery expansion,
provider mock harness, git-aware change set attribution, and
continuation/rebase/lineage.

## Next Recommended Cluster

Route 142 should target continuation/rebase/lineage cleanup. It is now the
largest remaining user-facing cluster and contains weak/no-cue follow-up,
cross-file reopen, temporal successor, rebased-target, and verify-hint
continuation failures.
