# Read / Inspect Intent Cleanup

Route: `docs/agent-routes/route140-read-inspect-intent.md`

## Scope

Route 140 repaired the Route 139 read/list/inspect/repo-explain cluster without
expanding provider, browser, edit, shell allowlist, CLI, dependency, or
`SessionManager` boundaries.

Starting full runMvp baseline: `101 passed / 50 failed`.

Current full runMvp baseline after this route: `111 passed / 40 failed`.

## Contract

- Read/list/inspect/repo-explain is a no-write capability family.
- `list files` / workspace inspection routes through deterministic `glob`, not
  through bash fallback.
- Targeted read requires an explicit in-workspace file path unless a read-like
  continuation target can be recovered.
- Missing, ambiguous, or unrecoverable read targets stop actionably; they are
  not edit mutation failures and do not claim success.
- Repo explanation first collects repository evidence with `glob` / `read`.
- Symptom-oriented repo diagnosis is grounded but still stops as
  `completed-with-caveats` / `stopped_error` until verification is run.
- Explicit allowlisted verify command behavior and unsupported shell blocking
  remain owned by Route 139 policy tests.

## Targeted Failure Decisions

| Test | Classification | Decision |
|---|---|---|
| derives file-oriented intent from prompt and uses glob without default bash demo path | product behavior drift | fixed by classifying list-files as inspect-files and routing to `glob(.ts)` |
| returns explicit guidance when read intent omits file path | stale status expectation + product clarity | rebaselined to actionable `stopped_error` with explicit in-workspace path guidance |
| inherits continuation target for pathless read follow-up from continuity context | product behavior drift | fixed by allowing pathless read intent to consume restored read target state |
| relocates inherited continuation target after migration when moved file has a single high-confidence candidate | product behavior drift | fixed with read-only basename relocation when the old target is missing and the candidate is unique |
| truthfully blocks continuation relocation when multiple candidates are ambiguous | stale status expectation | rebaselined to actionable `stopped_error`; ambiguity stays blocked |
| truthfully blocks continuation relocation when no recovery path exists | stale status expectation | rebaselined to actionable `stopped_error`; missing recovery stays blocked |
| defaults to grounded read when prompt provides a file path but lacks explicit read verb | product behavior drift | fixed for path-only prompts with optional line count |
| collects repo evidence before answering repo-specific coding questions | product behavior drift | fixed by repo-explain `glob(.ts)` + read evidence and diagnosis projection |
| routes runtime why/how questions to repo diagnosis instead of generic chat | product behavior drift | fixed by repo/runtime diagnosis routing |
| classifies symptom-oriented repo diagnosis as needs-verification with grounded evidence | stale status expectation + product diagnosis gap | diagnosis projection fixed; status rebaselined to `stopped_error` because caveated diagnosis needs verification |

## Implementation Notes

New focused owners:

- `packages/ts-shell/src/orchestration/readInspectIntent.ts`
- `packages/ts-shell/src/orchestration/readContinuationTarget.ts`
- `packages/ts-shell/src/orchestration/repoExplainEvidence.ts`

Minimal wiring remains in `runMvpIntegratedFlow.ts` for plan selection and
tool dispatch.

## Validation Evidence

- Focused read/inspect route:
  `14 passed / 141 skipped`
- Full `runMvpIntegratedFlow.test.ts`:
  `111 passed / 40 failed`

Remaining failures are outside this route: approval/transcript harness,
obsolete write-planning expectations, verification planner, edit continuation,
batch/edit result mapping, provider mock harness, continuation lineage, and
rebasing.

## Next Recommended Cluster

Route 141 should target verification planner cleanup before CLI/core split. The
largest remaining user-facing cluster is verify selection/retry/skipped/result
semantics, and it blocks many edit-flow tests without requiring provider,
browser, schema, or CLI expansion.
