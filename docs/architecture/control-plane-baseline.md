# Control-Plane Baseline

Route: `docs/agent-routes/route139-control-plane-baseline.md`

## Scope

Route 139 swept the current TypeScript control-plane baseline before more
agent-loop extraction. It fixed only high-confidence command/verification drift
and documented the remaining broad `runMvpIntegratedFlow.test.ts` reds instead
of hiding or broadening them.

Preserved boundaries:

- no provider live calls
- no browser or edit capability expansion
- no broad shell or command allowlist expansion
- no CLI UX, dependency, `SessionManager` schema, or broad runMvp rewrite
- no commit or push

## Reference Scan

Bounded reference scan was shape-only:

- opencode `permission/index.ts`: permission denial is an explicit typed
  outcome rather than a generic execution failure.
- opencode `session/message-v2.ts`: pending/running/error tool calls are
  converted into explicit tool result parts instead of dangling results.
- opencode `tool/read.ts`: directory read/list is a read capability with
  permission, not a silent shell-command fallback.
- OpenHands `app_server/event/README.md`: events are stored, queried, and
  streamed as first-class conversation facts.

No reference implementation code was copied.

## Baseline Sweep Result

| Gate | Result | Evidence |
|---|---:|---|
| Focused command/policy/result/projection/dispatch tests | pass | `39 passed` |
| Focused browser policy/runtime preservation tests | pass | `19 passed` |
| Focused Route 139 runMvp gate | pass | `7 passed / 144 skipped` |
| Full `runMvpIntegratedFlow.test.ts` baseline | red | `101 passed / 50 failed` |

The full runMvp suite remains a broad baseline map, not a Route 139 closeout
gate. Every remaining red is listed below.

## Repaired Issues

| Issue | Classification | Change | Evidence |
|---|---|---|---|
| `run dir` executed `node --version` through the default command fallback | product behavior drift | `dir` and `ls` are now recognized as unsupported command intents and stop with `command-not-allowlisted` instead of running an unrelated allowlisted command | focused runMvp `blocks dir/list-directory command intent instead of node --version fallback` passes |
| `Edit ... then run node --version to verify` did not select the explicit allowlisted verify command | product behavior drift | `node --version` is accepted as an explicit verify command without expanding the command allowlist | focused edit+verify runMvp test passes |
| English replace parsing captured `, then run ...` into the replacement text | product behavior drift | replacement target text is trimmed before trailing `then run` / `and run` command clauses | focused edit+verify runMvp test passes |
| Adjacent read/edit assertions expected stale note/evidence text | stale test expectation | expectations now assert current stable notes/evidence and user-facing delivery | focused runMvp gate passes |

## Policy / Result Audit

| Path | Current baseline | Decision |
|---|---|---|
| Successful command | `projectRunCommandDispatchOutcome` completes command-only success without mutation evidence | preserved |
| Command outside allowlist | `stopped_error`, terminal classification `stopped`, `actionable-blocker-kind:command-not-allowlisted`, actionable `DoNext` | repaired for `dir`/`ls`; existing `npm publish` path preserved |
| Command execution failure after approval | approved bash failure remains a hard command failure, not an approval denial | preserved by focused runMvp test |
| No-mutation edit/write | remains stopped when mutation evidence is required but absent | preserved; broad old write-content tests remain deferred |
| Browser policy/runtime | blocked/unavailable paths remain explicit and deterministic | preserved by focused browser tests |
| MCP unavailable/protocol/tool error | result mapper keeps MCP unavailable as actionable stopped where evidence exists | preserved by result mapper tests |
| Provider opt-in | not touched; no live provider calls were run | deferred to provider-specific route |
| Session/continue recovery | not changed; broad continuation reds are documented below | deferred |

## Deferred Red Baselines

| Test | Owner area | Classification | Decision / next action |
|---|---|---|---|
| derives file-oriented intent from prompt and uses glob without default bash demo path | command intent / inspect planning | product behavior drift | defer to command intent and read/inspect cleanup; do not fix inside Route 139 |
| uses explicit escalation callback instead of prompt-derived synthetic decisions | approval harness | harness/setup drift | defer to approval harness rebaseline |
| uses default single-assistant task contract without visible role labels | transcript contract | stale test expectation | rebaseline transcript role expectations in a session/transcript route |
| normalizes legacy resume runtime roles into single-assistant continuation contract | resume runtime | obsolete scenario | defer; legacy role normalization needs a dedicated continuation audit |
| writes a python file when prompt includes explicit create/write intent and path | write-file planning | obsolete scenario | current contract requires concrete content; rebaseline or redesign write planning separately |
| keeps multi-suffix targets stable for write tasks | write-file planning | obsolete scenario | same concrete-content contract gap |
| infers python script target in current workspace without explicit path | write-file planning | obsolete scenario | same concrete-content contract gap |
| still infers python write intent under mojibake-like prompt bytes | write-file planning | obsolete scenario | same concrete-content contract gap |
| returns explicit guidance when read intent omits file path | read planning/result | stale test expectation | current stopped guidance should be rebaselined if accepted |
| inherits continuation target for pathless read follow-up from continuity context | read continuation | product behavior drift | defer to continuation/read target route |
| relocates inherited continuation target after migration when moved file has a single high-confidence candidate | read continuation | product behavior drift | defer to continuation/read target route |
| truthfully blocks continuation relocation when multiple candidates are ambiguous | read continuation | stale test expectation | stopped semantics need rebaseline |
| truthfully blocks continuation relocation when no recovery path exists | read continuation | stale test expectation | stopped semantics need rebaseline |
| defaults to grounded read when prompt provides a file path but lacks explicit read verb | read planning | product behavior drift | defer to read/inspect intent cleanup |
| collects repo evidence before answering repo-specific coding questions | repo explain planning | product behavior drift | defer to read/inspect/repo-explain cleanup |
| routes runtime why/how questions to repo diagnosis instead of generic chat | repo explain planning | product behavior drift | defer to repo-explain cleanup |
| keeps current-directory write requests on write-file intent instead of workspace-info | write planning | obsolete scenario | current concrete-content contract blocks this path |
| classifies symptom-oriented repo diagnosis as needs-verification with grounded evidence | repo diagnosis | product behavior drift | defer to repo-explain cleanup |
| verifies write intent with readback in the same coding contract | write verification | obsolete scenario | current concrete-content contract blocks this path |
| replans continuation repair from prior failure evidence instead of replaying the same patch | edit continuation | product behavior drift | defer to continuation repair route |
| writes action result seed from execution result for next-turn continuity | action result seed | stale test expectation | update expected seed shape in continuation route |
| keeps corrective post-edit follow-up as edit even when it also asks to verify | edit continuation | product behavior drift | defer to continuation repair route |
| supports batch edit across multiple files with aggregated verify result | batch edit | product behavior drift | defer; outside Route 139 no edit expansion |
| builds git-aware change set attribution and separates pre-existing dirty files | git-aware change set | product behavior drift | defer to change-set attribution route |
| auto-selects focused verify for test-only edits without explicit verify command | verification planner | product behavior drift | defer to verification planner route |
| auto-selects broader verify for source edits without explicit verify command | verification planner | product behavior drift | defer to verification planner route |
| fails verify only after bounded retry attempts and records repair failure boundary | verification retry | product behavior drift | defer to verification planner route |
| skips targeted verify with explicit reason when changed files do not map to allowlisted verify commands | verification planner | stale test expectation | current not-requested semantics need rebaseline or redesign |
| grounds write content and completes when write target already exists | write planning | obsolete scenario | current concrete-content contract blocks this path |
| runs low-risk multi-file consistency verification after a file edit | verification planner | product behavior drift | defer to verification planner route |
| keeps multi-file consistency source separate from append target | verification planner | product behavior drift | defer to verification planner route |
| runs a constrained small refactor and keeps usage/protected files in sync | edit/refactor planning | product behavior drift | defer; broad edit/refactor path outside Route 139 |
| runs a constrained small bugfix and comment correction with protected files | edit/refactor planning | product behavior drift | defer; broad edit/refactor path outside Route 139 |
| creates and corrects a usage example file while preserving source files | edit/refactor planning | product behavior drift | defer; broad edit/refactor path outside Route 139 |
| fails low-risk multi-file consistency verification when target misses source item | result mapping | stale test expectation | current actionable verification failure maps to `stopped` |
| applies a user correction to the derived file and re-verifies consistency | verification planner | product behavior drift | defer to verification planner route |
| runs a small code edit plus README correction with low-risk file verification | edit/refactor planning | product behavior drift | defer; broad edit/refactor path outside Route 139 |
| returns deterministic failure boundary for partial batch edit failure | result mapping | stale test expectation | current partial mutation failure maps to actionable `stopped` |
| discovers candidate files for edit when prompt has no explicit file paths | edit discovery / command intent | product behavior drift | defer; discovery behavior crosses edit planning |
| fails clearly when discovery finds no editable candidate files | result mapping | stale test expectation | current no-candidate failure maps to actionable `stopped` |
| keeps planner/coder/reviewer provider semantics aligned in real mode | provider mock harness | harness/setup drift | defer; no live provider calls in Route 139 |
| uses custom base URL and model for openai-compatible real providers | provider mock harness | harness/setup drift | defer; no provider/auth changes in Route 139 |
| retries a transient openai-compatible draft-stream network failure before terminalizing the run | provider mock harness | harness/setup drift | defer; no provider/auth changes in Route 139 |
| activates same-file edit active slot for weak/no-cue follow-up when slot confidence is high | continuation lineage | product behavior drift | defer to continuation lineage route |
| returns clarify for weak/no-cue follow-up when same-file slot confidence is low | continuation lineage | stale test expectation | rebaseline reason text or redesign lineage gating |
| activates cross-file continuation candidate for weak/no-cue follow-up when reopen candidate is unique | continuation lineage | product behavior drift | defer to continuation lineage route |
| returns blocker disambiguation for weak/no-cue follow-up when cross-file reopen candidates are ambiguous | continuation lineage | stale test expectation | rebaseline reason text or redesign lineage gating |
| continues blocker->fix on rebased target after migration-like root change (English) | continuation rebasing | product behavior drift | defer to continuation/rebase route |
| continues blocker->fix on rebased target after migration-like root change (Chinese) | continuation rebasing | product behavior drift | defer to continuation/rebase route |
| persists verify command hint after blocker->fix continuation for verify closure | continuation verification | product behavior drift | defer to continuation verification route |

## Final Baseline Tables

### Green Gates

| Gate | Result |
|---|---|
| `capabilityBoundaryProjection.test.ts`, `flowDispatch.test.ts`, `flowProjection.test.ts`, `resultMapper.test.ts`, `dispatcher.test.ts` | pass |
| `browserAgentLoop.test.ts`, `browserRuntimePreflight.test.ts`, `browserExternalRunnerPolicy.test.ts` | pass |
| focused Route 139 runMvp gate | pass |
| `rtk npm run verify:edit-capability-closeout` | pass |
| `rtk npm run verify:result-contract` | pass |
| `rtk npm run build -w packages/ts-shell` | pass |
| `rtk git diff --check` | pass |

### Deferred Owners

| Owner | Count | Best next action |
|---|---:|---|
| read/inspect/repo-explain command intent | 5 | define supported read/list/inspect contract |
| write/edit planning and concrete-content contract | 12 | separate obsolete synthetic-write expectations from real behavior gaps |
| verification planner/result mapping | 9 | normalize verify command selection, retry, skipped, and stopped semantics |
| continuation/rebase/lineage | 14 | extract and test continuation target and lineage decisions |
| provider mock harness | 3 | rebaseline deterministic provider harness without live calls |
| transcript/approval harness | 4 | rebaseline role and approval prompt expectations |
| git/change-set attribution | 1 | isolate git-aware attribution from runMvp broad suite |
| batch edit/result mapping | 2 | keep deferred until an edit route opens batch semantics |

## Route 140 Recommendation

Route 140 should not continue generic extraction first. The strongest next
route is **Command intent and read/inspect capability cleanup**:

1. define whether list/read/inspect is command, read tool, glob tool, or blocked
   policy for each prompt family;
2. remove fallback execution for unsupported command-like prompts;
3. keep shell allowlist narrow and make blocked results actionable;
4. rebaseline broad runMvp tests only after current behavior is explicitly
   accepted or fixed.

The second-best route is verification planner cleanup, but it should wait until
read/inspect command intent is no longer masking prompt classification.
