# PROJECT_STATE.md

## 1. Current Stage Positioning

- Project name: private-coding-agents
- Current stage mainline: **active product hardening** on default CLI path
- Stage objective: make the interactive shell feel production-grade while preserving load-bearing runtime semantics
- Current focus: default CLI truthfulness / continuity, writer-started
  stopped-session continuity, non-write stopped `/continue` replay evidence,
  MCP visibility / execution / rejection consistency, tool lifecycle
  projection, stopped-session continuity projection, selected-workspace
  cross-process resume evidence, CLI entry parity, and isolated
  real-provider readiness smoke gating are stage-sealed; next implementation
  should be chosen from current main-path blockers instead of extending the
  same continuity proof family without a new regression.

What this stage is **not**:

- not a broad platform rewrite
- not a provider expansion campaign
- not a long-term memory project

## 2. Repository and Reference Boundaries

- Read-only reference repo:
  - `/home/wang/projects/source-claudecode`
- Writable working repo:
  - `/home/wang/projects/coding-agents`
- Secondary reference for UX/provider patterns:
  - `/home/wang/projects/opencode`

Boundary rules:

- recover load-bearing runtime truth from Claude Code snapshot when needed
- absorb practical CLI/product behavior from opencode where it improves real usage
- only modify and validate code in the private repo
- keep TS/Rust/contracts boundaries intact

## 3. Architectural Position (unchanged)

### TypeScript = control plane

Includes:

- shell / interactive CLI
- session lifecycle and continuity
- orchestration and query loop semantics
- slash routing / shell actions
- recovery and permission UX
- MCP capability routing
- terminal rendering contract and output boundary

### Rust = execution plane

Includes:

- daemon execution backend
- command execution / timeout / cancel
- sandbox preflight
- execution responsibility only

### contracts = cross-runtime semantic boundary

- protocol, lifecycle, and payload compatibility across runtimes

## 4. Current Product Mainline

The primary user-visible mainline is now:

1. User submits prompt in default CLI
2. Prompt resolves through shared turn execution backbone
3. Query loop runs with continuity and permission semantics
4. User sees answer-first terminal output
5. Result block stays minimal and actionable in compact mode
6. Session remains ready for next turn with clear boundaries

## 5. Latest Implemented Delta (through 2026-05-09)

### Current closeout: isolated opt-in real-provider readiness smoke

A new real-provider readiness smoke gate is available as an explicit opt-in
command and remains outside default test/build/CLI baseline paths.

Recent closeout commit:

- `de2576c Add isolated real-provider readiness smoke gate`

Key sealed evidence:

- `verify:provider-readiness:real` defaults to a skip/refusal path unless
  `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1` is set
- the smoke uses explicit provider env and an isolated
  `PRIVATE_AGENTS_TEST_ROOT` runtime home, then forces child CLI `HOME` and
  `USERPROFILE` to that isolated home
- the smoke refuses `PRIVATE_AGENTS_REAL_HOME` instead of reading real user
  provider configuration from `/home/wang/.private-agents-real`
- readiness outcomes are classified as missing-key, missing-config, auth,
  network, unsupported, unknown, pass, or product-regression instead of
  collapsing 401/403 or `invalid_api_key` into a generic failure
- classification and redaction self-tests can run without opt-in and without
  touching a real provider

Important boundaries:

- default `src/cli-baseline.test.ts`, build, result-contract verification, and
  provider readiness unit tests do not run the real-provider smoke
- this does not change production provider/auth flow, browser login,
  credential discovery, CLI interaction model, session schema, apply_patch,
  mutation flow, or real-provider home handling
- the actual real-provider smoke remains manual and credentialed; a missing
  opt-in or missing credential is a clear skip/config result, not a default
  test failure

Validation recorded for the closeout:

- `rtk npm run verify:provider-readiness:real`
- `rtk npm run verify:provider-readiness:real -- --classification-self-test`
- opt-in localhost-unreachable classification check exited with expected
  network classification
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

### Current closeout: CLI stdin / print / interactive entry parity

The CLI three-entry baseline route is stage-sealed on `main`.

Recent closeout commit:

- `22383f8 Add CLI entry parity baseline`

Key sealed evidence:

- `stdin`, `--print`, and pipe-spawn interactive paths now share focused
  parity baseline coverage for read-only prompt handling, `/sessions current`,
  provider-readiness missing-key surface, stopped `/continue`, and MCP
  unavailable surface
- the stdin harness exercises the real CLI entrypoint through child-process
  stdin instead of internal runtime helpers
- the interactive pipe-spawn wait marker now matches only output produced after
  test input is sent, reducing false positives from startup text
- entry-specific assertions preserve stopped/error/success truthfulness and do
  not allow `changedFiles` / `failedFiles` to vary by input transport

Important boundaries:

- this route only changes CLI baseline tests and the test harness
- it does not change provider implementation, session schema, runtime flow,
  MCP discovery, mutation flow, apply_patch capabilities, real-provider gates,
  or the broader CLI interaction model
- full `src/cli-baseline.test.ts` is hermetic after the provider-readiness
  isolation follow-up

### Current closeout: selected-workspace write cross-process resume evidence

The selected-workspace writer-started resume fixture route is stage-sealed on
`main`.

Recent closeout commit:

- `9459180 Add cross-process resume coverage for selected workspace writes`

Key sealed evidence:

- a first process runs the selected-workspace write route and writes a stopped
  session with `writerStarted=true` and `writeEffect=unknown|unverified`
- a second CLI `/continue <prompt>` process reloads the same persisted session
  and follows continuity-only resume instead of treating the previous turn as
  success
- resumed output preserves target, writer-started state, write effect,
  `requiresUserInspection`, and next action while keeping `changedFiles=[]`
  and avoiding fake file-level `failedFiles`
- `continueShellActionRuntime` now allows explicit `/continue <prompt>` on an
  actionable stopped session to proceed through continuity-only follow-up;
  ordinary guidance, completed sessions, and non-actionable stopped/error
  sessions remain guarded by their existing paths

Important boundaries:

- this is evidence and a narrow `/continue <prompt>` stopped-session fix, not a
  new write capability
- it does not change apply_patch support scope, session schema,
  compact/replay, provider behavior, MCP discovery, mutation flow, or CLI
  interaction model

### Current closeout: stopped-session continuity projection

The stopped-session recovery surface extraction is stage-sealed on `main`.

Recent closeout commit:

- `61cf822 Extract stopped-session continuity projection`

Key sealed evidence:

- `stoppedSessionContinuity.ts` owns the pure projection from existing stopped
  results, failure reasons, tool lifecycle projection, and mutation metadata to
  continuity payload
- `SessionManager.ts` now uses the focused projection for stopped/error
  continuity instead of carrying the local classification logic directly
- writer-started unknown/unverified, approval denied, stale-read, MCP
  unavailable, tool execution failed, and generic stopped/error cases remain
  distinct and keep actionable reasons / next actions
- continuity preserves only real `changedFiles` / `failedFiles` metadata and
  does not invent write success, fake changed files, or verified write effects

Important boundaries:

- session persistence schema, compact/replay, CLI continue flow, provider
  behavior, success handoff, and mutation flow are unchanged
- this is a bounded extraction, not a session-system rewrite

### Current closeout: tool lifecycle projection

The tool lifecycle projection extraction is stage-sealed on `main`.

Recent closeout commit:

- `337edec Extract tool lifecycle projection`

Key sealed evidence:

- `toolLifecycleProjection.ts` provides a pure projection for existing tool
  result/provenance/approval signals into stable lifecycle kinds such as
  success, approval-denied, tool-unavailable, MCP unavailable,
  MCP execution failed, tool execution failed, permission-blocked, and
  environment-blocked
- `runMvpIntegratedFlow.ts` has narrow wiring through
  `dispatchToolWithLifecycle` and verification-failure classification while
  keeping the original fallback paths
- MCP `isError` / stdio throw and generic tool failures are not success-like;
  approval denied, permission blocked, unavailable, and execution failed
  remain separate semantics
- the projection does not execute tools, access providers, read/write files,
  mutate session state, handle UI, or fabricate `changedFiles` / `failedFiles`

Important boundaries:

- query loop ordering, provider flow, mutation flow, CLI behavior, session
  storage, default apply_patch behavior, and MCP discovery are unchanged
- this is a bounded extraction from `runMvpIntegratedFlow.ts`, not a broad
  orchestration refactor

### Current closeout: hermetic provider-readiness CLI baseline

The default `src/cli-baseline.test.ts` suite is no longer polluted by
real-provider-like OpenAI auth/readiness state.

Recent closeout commit:

- `ff20c76 Fix provider readiness CLI baseline isolation`
- `be6135f fix auth error`

Key sealed evidence:

- the four formerly fragile real-provider-like CLI chain tests now use an
  isolated local OpenAI-compatible HTTP fixture through fake-home provider
  config instead of `NODE_OPTIONS` / `globalThis.fetch` interception
- full `src/cli-baseline.test.ts` now passes by default without real OpenAI
  credentials, browser login state, `/home/wang/.private-agents-real`, or live
  network success
- deterministic readiness coverage remains in default tests for missing-key,
  auth-like 401/403, unsupported/missing config, network retry, and CLI
  readiness surface
- real-provider readiness remains an explicit opt-in gate through
  `verify:provider-readiness` / `verify:provider-baseline`, not part of default
  CLI baseline

Important boundaries:

- this does not change provider/auth production behavior, browser login,
  credential discovery, CLI interaction model, session schema, apply_patch,
  mutation flow, or real-provider gate behavior
- real-provider gate was not run because this route isolates default tests and
  does not claim real-provider readiness success

Validation recorded for the closeout:

- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

### Current closeout: MCP visibility / execution / rejection consistency

The MCP focused gate is stage-sealed on `main`.

Recent closeout commit:

- `a024d11 Harden MCP tool failure provenance and continuity`

Key sealed evidence:

- MCP `isError` responses and MCP stdio execution throws no longer flow through
  a success result shape
- MCP unavailable/rejected/execution-failed outcomes retain provenance for
  execution path, server/tool, reason, and failure kind
- MCP unavailable is recognized as an actionable stopped blocker in
  `resultMapper`, `sessionRuntime`, and session continuity
- MCP unavailable/rejected/transport failure cases do not report
  `changedFiles` or fake file-level `failedFiles`
- CLI MCP baseline coverage exercises the visible user-facing MCP failure
  surface in addition to focused registry/provenance/runtime tests

Important boundaries:

- approval denied, MCP unavailable, and MCP execution failed remain separate
  failure classes; this route does not collapse them into a generic error
- this does not change provider/auth core, real-provider readiness, default
  production `apply_patch`, unified diff rejection, rollback, atomic
  transactions, or multi-file write behavior
- real-provider gate was not required because the route changes MCP/tool
  failure classification and session/result display only, without touching
  provider-facing credential or provider readiness paths

Validation recorded for the closeout commit:

- `rtk npm run build -w packages/ts-shell`
- `rtk npm run verify:result-contract`
- `rtk npm run test -w packages/ts-shell -- src/core/tools/runtime.mcp-stale-reconnect.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/mcp/gateway.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/tools/toolExecutionProvenance.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "MCP"`

### Current closeout: non-write stopped `/continue` replay evidence

The stopped result `/continue` replay evidence route has been extended beyond
writer-started write failures to cover representative non-write stopped cases.

Recent closeout commit:

- `6e62235 Add non-write stopped continue replay evidence`

Key sealed evidence:

- `/continue` has real CLI child-process fixture coverage for
  `patch-generation-failed`, `stale-read`, and `approval-denied`
- non-write stopped continuity preserves target, reason, blocker kind, failed
  file, and next action through the session handoff path
- no-writer stopped paths do not render `writer-started=yes`,
  `write-effect=*`, changed files, write intents, or success handoff
- `approval-denied` is now recognized as an actionable blocker kind in the
  no-write runtime result/resultMapper/session continuity path
- raw result evidence may still contain internal no-write markers such as
  `apply-patch-workspace-write-result:write-effect:none`; that remains
  acceptable as result evidence and does not enter continuity seed/display

Important boundaries:

- provider-readiness failure remains a current-turn/pre-query readiness concern,
  not an action-result `/continue` handoff
- this does not enable default production `apply_patch` writes
- this does not change provider/auth core, CLI provider readiness, release
  gates, rollback, atomic transactions, or default unified diff rejection
- real-provider gate is not required because this route changes synthetic
  session/result continuity evidence only and does not touch provider-facing
  behavior

### Current closeout: writer-started stopped-session continuity

The apply_patch writer-started stopped-session continuity route is stage-sealed
on `main`.

Recent closeout commits:

- `e8602e5 Add writer-started stopped session continuity`
- `271742a Narrow writer continuity evidence`

Key sealed evidence:

- explicit selected-workspace writer-started stopped states persist
  `writerStarted`, `writeEffect=unknown|unverified`,
  `requiresUserInspection`, target, reason, blocker, and next action through
  the session continuity seed
- next turn and `/continue` render failure handoff, target,
  `writer-started=yes`, `write-effect=unknown|unverified`, and re-read next
  action instead of success handoff
- writer-started stopped paths keep `changedFiles=[]` and do not expose
  write success or write intents
- no-writer blocked routes no longer surface `writeEffect=none` in the
  continuity display/seed path
- `/continue` now has end-to-end synthetic fixture coverage for both
  `writeEffect=unknown` and `writeEffect=unverified`

Important boundaries:

- this does not enable default production `apply_patch` writes
- this does not add rollback, atomic transactions, multi-file/add/delete/move,
  AST, or fuzzy patch support
- real-provider gate was not required for the final continuity evidence
  narrowing because no provider-facing route or provider/auth logic changed
- future behavior branches that change writer-reachable route semantics should
  rerun the selected-workspace real-provider smoke before claiming
  real-provider safety

Validation recorded for the final narrowing commit:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/workspaceWriteResult.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/lightweightChat.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

### Current closeout: default CLI truthfulness / continuity

The default CLI output and interaction-continuity route is stage-sealed on
`main`.

Recent closeout commits:

- `b0dca85 Make CLI turn endings truthful`
- `f7cc6ef fix cli continuity recovery surface`

Key sealed evidence:

- turn endings now use a focused turn-boundary surface instead of ad hoc CLI
  wording
- `/sessions current`, `/sessions switch`, `/resume`, and `/continue` share the
  current session store and surface resume readiness from `sessionStateSurface`
- `runResumeLikeShellAction` consumes `autoResume` payloads with runtime seed and
  continuity state instead of only opening session context
- completed-session `/continue` carries continuity seed notes through the
  lightweight no-write route
- interrupted resume smoke now uses a local HTTP mock, reducing provider mock
  leakage from `NODE_OPTIONS --require`
- the explicit lightweight real-provider gate passed with redaction and
  repository-clean checks

Important boundaries:

- this does not prove true PTY terminal fidelity
- this does not enable default production `apply_patch` writes
- this does not add multi-file/add/delete/move/AST/fuzzy/rollback support
- writer-started stopped-session continuity is now sealed separately on `main`

### A. Transport-unified turn execution (already landed)

- shared turn resolver/executor paths across interactive, `--print`, stdin, and replay
- stdin moved to stream-first reading + sequential prompt batch execution
- interactive in-flight gating to reduce overlapping-turn submission issues

### B. Answer-first terminal rendering contract (landed)

- compact mode suppresses planner-phase leakage (for example `Plan accepted...`)
- compact mode renders minimal terminal outcome + minimal coding contract
- verbose mode keeps full lifecycle/result diagnostics for developer view
- minimal result classification now considers task satisfaction evidence to avoid misleading “completed=success” messaging in blocked flows

### C. Live turn boundary UX (landed in interactive path)

- interactive turn boundary markers:
  - `=== Turn N ===`
  - `=== End Turn N ===`

### D. Single-file edit repair acceptance (stage closeout)

Real-provider CLI acceptance now covers the two core single-file edit repair chains:

| Scenario | Provider acceptance | Status | Key evidence marker | Regression guard |
| --- | --- | --- | --- | --- |
| replace success | synthetic | pass | changedFiles / change summary | `runMvpIntegratedFlow.test.ts` focused edit coverage |
| patch-from-not-found failure | real-provider + synthetic | pass | `failureReason:patch-from-not-found`, actionable nextAction | `runMvpIntegratedFlow.test.ts` patch-from-not-found coverage |
| patch-from-not-found follow-up repair | real-provider + synthetic | pass | `repairContextUsed:true`, `repairedFailureReason:patch-from-not-found`, `repairPayloadKind:replace-directive` | `runMvpIntegratedFlow.test.ts` repair follow-up coverage |
| patch-ambiguous failure | real-provider + synthetic | pass | `failureReason:patch-ambiguous`, matched-count explanation, actionable nextAction | `runMvpIntegratedFlow.test.ts` patch ambiguous coverage |
| patch-ambiguous follow-up repair | real-provider + synthetic | pass | `repairContextUsed:true`, `repairedFailureReason:patch-ambiguous`, `repairPayloadKind:replace-directive` | `runMvpIntegratedFlow.test.ts -t "repairs patch ambiguous"` |
| repair evidence visible in CLI surface | real-provider + synthetic | pass | repaired failure reason / target file / payload kind visible in Action result | `sessionRuntime.test.ts` repair context rendering |
| multi failed target abandoned diagnostic | synthetic + real CLI acceptance | pass | `repairContextUsed:false`, `repairContextAbandoned:true`, `multiple-failed-targets`, candidate count | `runMvpIntegratedFlow.test.ts -t "failed target candidates"` and `sessionRuntime.test.ts` |


### E. Real-provider minimal coding flow evidence (stage-sealed 2026-05-05)

The explicit opt-in `--real-coding-flow-smoke` has passed for the isolated minimal single-file write route. This is evidence that a real provider can enter the coding flow, read and edit the isolated fixture, emit a visible terminal result, and preserve repository/provider-home safety boundaries.

Key sealed evidence:

- real provider preflight was ready before execution
- normal coding flow was entered; the turn was not handled by repo-aware summary routing
- action sequence included `read` and `edit`
- only `note.txt` changed; `changedFiles` was exactly `["note.txt"]`
- `note.txt` changed from `status: draft` to `status: ready`
- protected fixture files `README.md` and `LOCKED.md` stayed unchanged
- verification passed and terminal result details were visible
- real repository stayed clean before/after the smoke
- runtime home, fixture workspace, report, and audit log were isolated under the test root and cleaned after the run
- redaction passed; real provider config content, paths, tokens, keys, and headers were not printed or committed
- mutation diagnostics were corrected so successful structured edits no longer misleadingly report missing replacement fields

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of `release-core`, `cli-entry`, `result-contract`, CI, or any default gate
- real provider configuration must still be supplied explicitly and must not be read, printed, copied, modified, cleaned, or committed
- the evidence covers only the isolated fixture's minimal single-file write path
- it does not prove maturity of multi-file edit, full `apply_patch`, long-task continuity, true PTY automation, or production repository mutation workflows

Recent route-closing commit:

- `4b6b90c Fix real coding smoke mutation diagnostics source`

### F. Real-provider failure follow-up explanation evidence (stage-sealed 2026-05-05)

The explicit opt-in `--real-coding-flow-followup-smoke` has passed for the synthetic stopped/failure follow-up route. This is evidence that a real provider can receive a redacted `patch-from-not-found` / `mutation instruction missing` context through the non-mutating direct-provider explanation path and produce a safe recovery explanation without mutating the fixture or repository.

Key sealed evidence:

- `followupExecutionPath=direct-provider-explanation`
- `enteredEditTargetResolution=false` and `ambiguousTargetDetected=false`
- `responseVisible=true`
- `acknowledgesTarget=true` for `note.txt`
- `acknowledgesFailure=true` for the stopped/failure context
- `safeNextAction=true`
- `claimsSuccess=false`
- `fixtureMutationLeak=false`
- `repositoryClean=true`
- audit output was isolated under the test root
- redaction passed; real provider config content, paths, tokens, keys, and headers were not printed or committed

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of `release-core`, `cli-entry`, `result-contract`, CI, or any default gate
- it validates failure-context explanation only, not automatic recovery, edit repair execution, durable stopped-session resume, or stopped-session auto-recovery
- stopped durable session auto-recovery strategy is unchanged

Recent route-closing commits:

- `f4957e3 Use direct provider path for coding flow follow-up smoke`
- `652434b Fix direct provider follow-up eval wrapper`

Explicitly unsupported in this stage:

- fuzzy replace matching
- AST edit
- multi-file edit repair expansion
- multi failed target automatic repair
- implicit workspace/root mode changes as part of edit repair


### G. Single-file `apply_patch` pre-production surface contracts (stage-sealed 2026-05-05)

The single-file `apply_patch` route is sealed through contract-only dry-run, stale-read, permission metadata, terminal-safe surface, runtime bridge, resultMapper consumer, and sessionRuntime display contracts. This proves preview / blocked / permission-pending states remain non-mutating and non-success-like across mapper/display projections.

Important boundaries:

- production `apply_patch` and unified diff inputs remain rejected in the mutation lane
- no production writer, CLI, `runMvpIntegratedFlow`, resultMapper production logic, or sessionRuntime production logic is wired for this route
- production write decision gate remains blocked pending explicit permission UX, final stale-read revalidation placement, writer boundary proof, and approved runtime/display wiring

Recent route-closing commits:

- `7aee9f8 Add single file apply patch resultMapper consumer contract`
- `d9658e5 Add single file apply patch sessionRuntime display contract`

### H. Single-file `apply_patch` result/session safe wiring seams (stage-sealed 2026-05-06)

The production write gate preconditions and result/session safe wiring phase are sealed at contract/seam level. The route now has explicit permission UX, final stale-read, writer boundary proof, resultMapper seam, and sessionRuntime seam coverage without production runtime wiring.

Key sealed evidence:

- resultMapper-facing seam consumes mapper-safe projection only
- sessionRuntime-facing seam consumes resultMapper seam output only
- dry-run, blocked, and permission-pending states stay non-success-like
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`, no writer invocation, no applied patch record, and no mutation success remain preserved
- actionable `nextAction` / `doNext` stays visible through the seam outputs

Important boundaries:

- production `resultMapper.ts` and `sessionRuntime.ts` logic is still unchanged for this route
- CLI, SessionManager, `runMvpIntegratedFlow`, provider/auth, real-provider scripts, release gates, and writer code remain unwired
- production `apply_patch` and unified diff rejection behavior remains required
- real-provider coverage remains unnecessary for this seam-only phase and is not meaningful for production write until a route is separately approved

Recent route-closing commits:

- `Add single file apply patch resultMapper seam contract`
- `Add single file apply patch sessionRuntime seam contract`
- `Document single file apply patch result session safe wiring blockers`

### I. Single-file `apply_patch` real-provider non-mutating dry-run smoke (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-dry-run-smoke` has passed for the
single-file `apply_patch` production-adjacent dry-run route. This is evidence
that a real provider can produce a single-file `apply_patch` preview and that
the preview can pass through the explicit opt-in dry-run route without writing.

Key sealed evidence:

- real provider preflight was ready before execution
- the provider produced exactly one `apply_patch` preview block for `src/app.ts`
- route status and display status stayed `permission-pending`
- terminal classification stayed `stopped`, not `success`
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`
- `noWriterInvoked=true` and no applied patch record was recorded
- fixture files stayed unchanged and the real repository stayed clean
- redaction passed; real provider config content, paths, tokens, keys, and
  headers were not printed or committed

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of release/default
  gates or CI
- it validates only a provider-facing non-mutating dry-run preview
- production `apply_patch` and unified diff inputs remain rejected by default
- production write, writer invocation, and production resultMapper/sessionRuntime
  wiring remain blocked pending separate review

Recent route-closing commits:

- `Add single file apply patch real provider dry run smoke`
- `Document single file apply patch real provider dry run gate outcome`

### J. Single-file `apply_patch` real-provider permission UX no-write gate (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-permission-ux-smoke` has passed for the
single-file `apply_patch` provider-facing permission UX route. This is evidence
that a real provider can produce a single-file `apply_patch` preview and the
runtime can project pending, denied, and blocked permission UX states without
writing or claiming success.

Key sealed evidence:

- real provider preflight was ready before execution
- the provider produced exactly one `apply_patch` preview block for `src/app.ts`
- permission UX states stayed distinct: `pending`, `denied`, and `blocked`
- terminal classification stayed `stopped`, not `success`
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`
- `noWriterInvoked=true` and no applied patch record was recorded
- fixture files stayed unchanged and the real repository stayed clean
- redaction passed; real provider config content, tokens, keys, and headers were
  not printed or committed

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of release/default
  gates or CI
- it validates only provider-facing permission UX no-write projection
- approval still does not authorize a write
- production `apply_patch` and unified diff inputs remain rejected by default
- production write, writer invocation, and production resultMapper/sessionRuntime
  wiring remain blocked pending separate review

### K. Single-file `apply_patch` isolated fixture write smoke (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-write-fixture-smoke` now exists and is
validated locally and by real provider as the narrow isolated fixture write
gate. After a route bridge repair, the real-provider rerun passed.

Key sealed evidence:

- readiness preflight passed
- default production `apply_patch` / unified diff rejection regression passed
- real-provider model path was reached
- provider output contained exactly one `apply_patch` block
- write decision status was `approved-for-write`
- isolated write lane status was `written`
- only isolated fixture `src/app.ts` changed
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- `fixtureWriterInvoked=true`
- `productionWriterInvoked=false`
- terminal success was allowed only after verified isolated fixture write
- no applied patch record was recorded
- redaction passed
- real repository stayed clean

Current gate state: passed as an explicit opt-in isolated fixture write gate.
It is not production write wiring and is not evidence that production write may
be enabled by default.

Important boundaries:

- this smoke remains explicit opt-in only and uses a temporary fixture
- production `apply_patch` and unified diff inputs remain rejected by default
- production write, writer invocation, and production resultMapper/sessionRuntime
  wiring remain blocked pending separate review
- no further automatic provider retry is planned; any future rerun requires
  explicit real-provider opt-in, isolated fixture, redaction, and repo-clean
  constraints

### L. Single-file `apply_patch` guarded production-write candidate smoke (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-guarded-write-smoke` has passed for the
single-file `apply_patch` guarded production-write candidate lane against an
isolated temporary workspace.

Key sealed evidence:

- readiness preflight passed
- real-provider model path was reached
- provider output contained exactly one `apply_patch` block
- write decision status was `approved-for-write`
- guarded gate status was `ready`
- guarded write lane status was `written`
- only isolated workspace `src/app.ts` changed
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- production writer was invoked only with `productionWriterTarget=isolated-workspace`
- `realRepositoryWrite=false`
- terminal success was allowed only after verified isolated workspace write
- no applied patch record was recorded
- redaction passed
- real repository stayed clean

Important boundaries:

- this smoke remains explicit opt-in only and uses a temporary workspace
- production `apply_patch` and unified diff inputs remain rejected by default
- default production write remains blocked
- production result/session/runtime wiring still requires a separate review
- the passing guarded candidate does not approve multi-file/add/delete/move,
  AST, fuzzy patching, rollback, or release/default gates

### M. Single-file `apply_patch` guarded production route seam (stage-sealed 2026-05-06)

The guarded production route seam has been added and validated locally for an
explicit opt-in, single-file Update File route against an isolated temporary
workspace.

Key local evidence:

- route wiring gate requires explicit route opt-in
- guarded gate must be `ready`
- write decision must be `approved-for-write`
- final stale-read remains immediately before the writer
- result/session status is write-success only after verified write
- non-opt-in route requests remain stopped/no-write
- default production `apply_patch` and unified diff rejection remains unchanged

Real-provider guarded route smoke status:

- readiness preflight passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- real-provider model path was reached
- provider output contained exactly one `apply_patch` block
- write decision status was `approved-for-write`
- guarded gate, route gate, production route, and write lane were ready/written
- resultMapper projection mapped the verified route write to `completed/success`
- session display projection showed `write-success` only after the verified write
- only isolated workspace `src/app.ts` changed
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- production writer was invoked only with `productionWriterTarget=isolated-workspace`
- `realRepositoryWrite=false`
- terminal success was allowed only after verified isolated workspace write
- no applied patch record was recorded
- repository clean: true
- redaction: pass

Current gate state: passed as an explicit opt-in guarded route gate against an
isolated workspace. This is not default production write enablement.

Important boundaries:

- this smoke remains explicit opt-in only and uses a temporary workspace
- production `apply_patch` and unified diff inputs remain rejected by default
- default production write remains blocked
- production CLI / `runMvpIntegratedFlow` write wiring still requires a separate
  entrypoint review before touching real user workspaces

### N. Single-file `apply_patch` CLI / runMvp no-write entrypoint (landed 2026-05-06)

The single-file `apply_patch` route now has an explicit CLI /
`runMvpIntegratedFlow` no-write entrypoint for raw Update File payloads against
the selected workspace.

Key evidence:

- CLI requires `--apply-patch-runtime-route` before the runtime route is used
- `runMvpIntegratedFlow` requires an explicit `applyPatchRuntimeRoute` option
- requested approval from `--non-interactive-approval allow-once|allow-always`
  is recorded only as permission UX input and does not authorize a write
- runtime output is mapped from the safe no-write projection
- terminal/session output stays stopped/non-success-like
- `changedFiles=[]`, `writeIntents=[]`, no writer invocation, and no applied
  patch record remain preserved
- the CLI entrypoint leaves the selected workspace file unchanged

Important boundaries:

- this is not real-user workspace write enablement
- production `apply_patch` and unified diff inputs remain rejected by default
- write success remains limited to the explicit isolated-workspace guarded route
- real-workspace writer routing still requires a separate write-entrypoint
  review for UX, durable state, abort/rollback, and final writer boundary

### O. Single-file `apply_patch` real workspace write entrypoint (landed 2026-05-07)

The single-file `apply_patch` route now has an explicit CLI /
`runMvpIntegratedFlow` write entrypoint for raw `Update File` payloads against
the selected workspace.

Key implemented boundaries:

- CLI requires `--apply-patch-workspace-write` before the workspace writer is
  reachable
- existing `--apply-patch-runtime-route` remains no-write when the workspace
  write flag is absent
- `--non-interactive-approval allow-once|allow-always` is required as explicit
  approved-for-write input for this entrypoint
- final stale-read runs immediately before the writer
- writer success is projected only after post-write content verification
- selected workspace authority rejects symlink targets, validates realpath
  workspace containment, and uses descriptor-verified reads/writes for the
  opened target
- symlink swaps at the writer boundary are blocked without reporting changed
  files or write success
- abort before the selected-workspace writer is reached now stops the route with
  no write effect, and writer-started failures now preserve durable
  `unknown`/`unverified` write-effect attribution for user inspection before
  retry
- workspace-boundary, write-application, and post-write verification failures
  now surface as stopped write/readback blockers instead of generic success-like
  results
- denied, blocked, stale, unsupported, and no-op routes remain stopped and do
  not report changed files or write success
- default production `apply_patch` and unified diff rejection remains required

Real-provider workspace-write smoke status:

- readiness preflight passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- real-provider model path produced exactly one `apply_patch` block
- CLI workspace write entrypoint wrote only isolated test workspace `src/app.ts`
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- writer target was isolated test workspace
- terminal success was allowed only after verified write
- repository clean: true
- redaction: pass

Important boundaries:

- this is not default production `apply_patch` enablement
- this does not add multi-file/add/delete/move/AST/fuzzy/rollback support
- this does not add rollback or full atomic transaction semantics; if the writer
  has started and verification cannot prove success, the user-visible state is
  stopped and requires re-reading the current target before retry
- this does not change release/default gates
- real-provider workspace-write smoke must run only with explicit opt-in,
  isolated HOME/test workspace, redaction, and repository-clean checks

## 6. Confirmed Baseline Facts

- unified query loop exists and is durable
- replay/recovery substrate exists
- lifecycle compensation exists
- terminal envelope semantics exist (`terminalReason` + classification)
- provider readiness gate exists before real-provider execution
- compact vs verbose user output layering exists
- `/connect` is the provider onboarding command family (not `/auth`)

## 7. Current Primary Gaps

1. true PTY automation evidence remains weaker than print/stdin/replay and
   pipe-spawn interactive evidence in this environment
2. execution success still depends on model/tool behavior; sealed real-provider
   smokes prove only their explicit isolated or selected-workspace routes
3. multi-file edit, default production `apply_patch` write, rollback/atomic
   write recovery, and true PTY automation remain outside the sealed evidence
4. production single-file `apply_patch` default CLI / `runMvpIntegratedFlow`
   write route remains disabled; an explicit CLI/runMvp no-write route exists,
   an explicit workspace write entrypoint has landed with durable
   writer-started failure attribution, and default rejection is still required
5. real-provider write evidence covers explicit opt-in isolated or selected
   test workspaces, not default real user workspace mutation
6. some legacy docs and examples still reflect previous phase assumptions and need gradual cleanup

## 8. Re-entry / Escalation Triggers

Escalate from hardening into focused implementation when one is reproducible:

1. real live-CLI task shows answer/result boundary regression (answer missing, noisy leakage, or false completion)
2. transport parity drift appears between interactive and non-interactive paths
3. continuity breaks in active session for core coding workflow (read/edit/verify follow-up)

## 9. Current Minimal Next Step

- Do not continue same-family CLI truthfulness, approval/tool provenance, PTY
  boundary, or minimal apply_patch evidence work unless a regression appears.
- Writer-started stopped-session continuity for explicit selected-workspace
  `apply_patch` results is now sealed for next turn and `/continue`; do not
  continue that same-family route unless a new regression appears.
- Non-write stopped `/continue` replay evidence for
  `patch-generation-failed`, `stale-read`, and `approval-denied` is now sealed;
  do not keep expanding same-family stopped replay fixtures unless a concrete
  stopped/resume regression appears.
- If continuing apply_patch, the next route should be a fresh blocker
  assessment around default-route safety, rollback/atomicity, or user-workspace
  policy rather than more continuity proof.
- Keep default production `apply_patch` enablement blocked until a separate
  review defines rollback behavior and default user-workspace safety policy.
- Existing real-provider gates remain explicit opt-in evidence only; do not
  rerun them for documentation-only changes or unrelated route selection.
- Avoid unrelated provider/auth expansion during this stage unless it blocks
  mainline usability.

## 10. Update Rules

Update this file when one of these changes materially:

- stage objective or stage mode
- product mainline contract
- baseline facts or primary gaps
- escalation triggers

Do not turn this file into:

- run-by-run transcript dump
- roadmap backlog
- provider marketing sheet
