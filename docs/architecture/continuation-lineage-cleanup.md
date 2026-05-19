# Continuation Lineage Cleanup

Route: `docs/agent-routes/route142-continuation-lineage.md`

## Scope

Route 142 repaired and rebaselined the continuation / rebase / lineage cluster
without provider live calls, browser feature work, edit capability expansion,
schema migration, CLI/dependency changes, or a broad `runMvpIntegratedFlow.ts`
rewrite.

Starting full runMvp baseline: `112 passed / 39 failed`.

Current full runMvp baseline after this route: `127 passed / 24 failed`.

## Contract

- Continuation can reuse summarized, replay-safe lineage facts.
- Continuation summaries must not depend on raw DOM, raw file dumps, secrets,
  hidden transcript content, or private scratch state.
- Weak follow-up may carry a prior target only when the target is unambiguous,
  still workspace-safe after rebase, tied to replay-safe evidence, and does
  not infer destructive action beyond the current edit contract.
- Cross-file reopen resolves only when there is one deterministic candidate.
  Multiple candidates stop actionably with disambiguation.
- Path rebase may map legacy absolute paths to the current workspace only
  through deterministic suffix/workspace facts.
- Verification hints carry only with the same task/target lineage.
- Unsupported or skipped mutation verification remains recoverable `stopped`,
  not a false completed success.

## Reference Scan

Bounded reference scan was shape-only; no implementation code was copied.

- Claude Code `/resume` keeps same-worktree resume direct and turns cross-project
  resume into an explicit command, matching this route's deterministic
  workspace rebase boundary.
- Claude Code `/compact` projects messages after the compact boundary and runs
  cleanup after compaction, reinforcing replay-safe summaries instead of raw
  transcript dependence.
- opencode's v2 session note removes special session initialization routes,
  reinforcing that Route 142 should add focused continuation helpers rather
  than a new session framework.
- Gemini CLI has a deterministic resume regression test that uses fake
  responses, matching this route's no-live-provider validation posture.
- OpenHands event docs treat conversation events as persisted/queryable
  records, aligning with stable event summaries over raw hidden state.

## New Owners

- `packages/ts-shell/src/orchestration/continuationIntent.ts`
- `packages/ts-shell/src/orchestration/continuationLineage.ts`
- `packages/ts-shell/src/orchestration/continuationRebase.ts`
- `packages/ts-shell/src/orchestration/continuationProjection.ts`
- `packages/ts-shell/src/orchestration/continuationLineage.test.ts`

Existing `continuationPlanning.ts` remains the planning bridge. Route 142 did
not introduce a new persistence layer or session schema.

## Targeted Failure Decisions

| Test | Classification | Decision |
|---|---|---|
| promotes weak-evidence corrective continuation into executable repair instead of continuity summary | stale terminal expectation + product clarity | rebaselined to recoverable stopped when verification is skipped; edit still executes |
| avoids repeating the previous direction for same-file corrective continuation when alternate transforms exist | stale terminal expectation + product clarity | rebaselined to recoverable stopped; alternate transform still applies |
| activates same-file edit active slot for weak/no-cue follow-up when slot confidence is high | product behavior drift + stale terminal expectation | fixed lineage activation evidence; rebaselined skipped verification to stopped |
| returns clarify for weak/no-cue follow-up when same-file slot confidence is low | product behavior drift | fixed actionable slot ambiguity and evidence markers |
| activates cross-file continuation candidate for weak/no-cue follow-up when reopen candidate is unique | product behavior drift + stale terminal expectation | fixed lineage activation evidence; rebaselined skipped verification to stopped |
| returns blocker disambiguation for weak/no-cue follow-up when cross-file reopen candidates are ambiguous | stale reason expectation + product clarity | rebaselined to `multiple candidate targets` blocker |
| normalizes ambiguous ultra-weak and temporal polluted-history variants to cross-file blocker surface | stale reason expectation | rebaselined to target ambiguity rather than missing-transform wording |
| auto-continues temporal successor cue `next` / `what next` with one executable target | stale terminal expectation | mutation executes; skipped verification remains recoverable stopped |
| rolls temporal continuation evidence across multi-hop successor cues | stale terminal expectation | first hop rebaselined to recoverable stopped while preserving next-hop lineage |
| prevents inverse stale-transform rebound across temporal successor hops | stale terminal expectation | first hop rebaselined; stale-transform blocker behavior preserved |
| retires stale blocker evidence for generic temporal re-entry while allowing explicit override | stale terminal expectation | explicit override executes; skipped verification remains recoverable stopped |
| continues blocker->fix on rebased target after migration-like root change (English/Chinese) | product behavior drift + stale terminal expectation | fixed legacy path transform parsing/rebase; rebaselined skipped verification to stopped |
| persists verify command hint after blocker->fix continuation for verify closure | product behavior drift + stale terminal expectation | fixed verify hint carryover on repair continuation; target hint is rebased workspace-relative |
| replans continuation repair from prior failure evidence instead of replaying the same patch | stale continuation-status expectation | current direct transform is `first-pass-success`; no synthetic recovered status is claimed |

## Implementation Notes

- Continuation intent is classified without provider calls or tool execution.
- Replay-safe lineage filters unsafe/raw evidence markers and carries targets,
  result status, evidence ids, and verification hints only.
- Rebase resolution is deterministic and does not perform broad filesystem
  search.
- Lineage activation markers are projected into coding evidence so `/continue`
  and follow-up summaries can explain why a target was carried or blocked.
- Windows/legacy-root transform evidence now parses correctly before applying
  workspace rebase.

## Validation Evidence

- Focused continuation lineage/planning tests: `13 passed`
- Focused continuation runMvp cluster: `18 passed / 133 skipped`
- Route 137-141 preservation helper tests: `53 passed`
- Full `runMvpIntegratedFlow.test.ts`: `127 passed / 24 failed`
- `rtk npm run verify:edit-capability-closeout`: pass
- `rtk npm run verify:result-contract`: pass
- `rtk npm run build -w packages/ts-shell`: pass
- `rtk git diff --check`: pass

Remaining failures are outside this route:

| Cluster | Count | Notes |
|---|---:|---|
| edit/refactor/batch/discovery expansion | 10 | bounded edit expectations, skipped verification terminal rebaseline, and discovery behavior |
| write planning and concrete-content contract | 7 | old synthetic write expectations now require concrete content |
| provider mock harness | 3 | deterministic provider transcript still expects reviewer turn |
| approval/transcript/resume harness | 3 | approval callback, role contract, and legacy resume expectations |
| git-aware change set attribution | 1 | git attribution remains isolated from continuation lineage |

## Next Recommended Cluster

Route 143 should target stale write/edit expectations and concrete-content /
bounded edit cleanup. That is now the largest remaining cluster and includes
old write-file completion expectations, single-file repair expectations, batch
edit/refactor expansion, and terminal rebaseline for edit discovery failures.
