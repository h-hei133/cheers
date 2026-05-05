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
3. multi-file edit, full apply_patch, long-task continuity, and true PTY automation remain outside the sealed real-provider minimal write evidence
4. some legacy docs and examples still reflect previous phase assumptions and need gradual cleanup

## 8. Re-entry / Escalation Triggers

Escalate from hardening into focused implementation when one is reproducible:

1. real live-CLI task shows answer/result boundary regression (answer missing, noisy leakage, or false completion)
2. transport parity drift appears between interactive and non-interactive paths
3. continuity breaks in active session for core coding workflow (read/edit/verify follow-up)

## 9. Current Minimal Next Step

- single-file `apply_patch` production write remains blocked; start with a new `$deep-interview` before any permission UX, final stale-read production placement, writer boundary, or runtime/display production wiring work
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
