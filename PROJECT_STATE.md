# PROJECT_STATE.md

## 1. Current Stage Positioning

- Project name: private-coding-agents
- Current stage mainline: **active product hardening** on default CLI path
- Stage objective: make the interactive shell feel production-grade while preserving load-bearing runtime semantics
- Current focus: transport-unified turn execution + answer-first terminal rendering contract

What this stage is **not**:

- not a broad platform rewrite
- not a provider expansion campaign
- not a long-term memory project

## 2. Repository and Reference Boundaries

- Read-only reference repo:
  - `D:\LenovoSoftstore\pyproject\source-claudecode`
- Writable working repo:
  - `D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents`
- Secondary reference for UX/provider patterns:
  - `D:\LenovoSoftstore\pyproject\opencode`

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

## 5. Latest Implemented Delta (2026-04-26)

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

## 6. Confirmed Baseline Facts

- unified query loop exists and is durable
- replay/recovery substrate exists
- lifecycle compensation exists
- terminal envelope semantics exist (`terminalReason` + classification)
- provider readiness gate exists before real-provider execution
- compact vs verbose user output layering exists
- `/connect` is the provider onboarding command family (not `/auth`)

## 7. Current Primary Gaps

1. true live TTY automation evidence remains weaker than print/stdin/replay evidence in this environment
2. execution success still depends on model/tool behavior; the sealed real-provider smoke only proves the isolated minimal single-file write path
3. multi-file edit, production apply_patch write, long-task continuity, and true PTY automation remain outside the sealed real-provider minimal write evidence
4. production single-file `apply_patch` default CLI / `runMvpIntegratedFlow` write route remains unwired; default rejection is still required
5. the guarded production route real-provider smoke has passed only for explicit opt-in isolated workspace routing, not default real user workspace mutation
6. some legacy docs and examples still reflect previous phase assumptions and need gradual cleanup

## 8. Re-entry / Escalation Triggers

Escalate from hardening into focused implementation when one is reproducible:

1. real live-CLI task shows answer/result boundary regression (answer missing, noisy leakage, or false completion)
2. transport parity drift appears between interactive and non-interactive paths
3. continuity breaks in active session for core coding workflow (read/edit/verify follow-up)

## 9. Current Minimal Next Step

- single-file `apply_patch` guarded route is now validated through real-provider,
  resultMapper projection, and session display projection in an isolated
  workspace
- do not continue to default production write enablement, CLI wiring, or
  `runMvpIntegratedFlow` workspace mutation before a separate entrypoint review
  defines the explicit opt-in UX and real-user workspace boundary
- the isolated fixture and guarded isolated-workspace write smokes have passed; treat them only as explicit opt-in isolated evidence, not default production write evidence, and do not rerun automatically
- the real-provider non-mutating dry-run smoke and permission UX no-write smoke are sealed; do not rerun them by default unless validating a regression or a new provider-facing route decision
- consider durable stopped-session continuity analysis as separate, explicitly scoped work
- do not continue same-family minimal write or failure-explanation smoke hardening unless a regression appears
- keep hardening the default interactive experience and output truthfulness
- avoid unrelated provider/auth expansion during this stage unless it blocks mainline usability

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
