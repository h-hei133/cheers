# Route 202: Proof-carrying live task loop

## Goal

Build the first proof-carrying live mutation vertical slice.

The project innovation point is now:

A claim-calibrated runtime for proof-carrying code mutation.

This route must not be treated as another no-write scaffold, verifier marker route, or focused-contract-only route. It must connect the current task-loop smoke to the already-proven openai-compatible provider boundary and prove a controlled live provider to anchored proposal to confirmed apply to readback verification chain.

The previous project map froze these facts:

- Route 199 proved live openai-compatible provider-called exact-ready no-write anchored smoke.
- Route 200 did not prove live task-loop success.
- Route 200 observed provider-called=false, anchor-quality=none, apply=not-run, verification=not-run, mutation-scope=none, status=task-loop-stopped.
- Focused tests, default-safe skips, fake-ready provider paths, and scaffold markers must not be counted as live task-loop completion.
- Exact-ready anchoring is handoff readiness, not mutation authority.
- Result/session truthfulness must continue to prevent false terminal success.

Route 202 must turn the task-loop route into a proof-carrying controlled task loop:

user task claim
-> live provider claim
-> proposal validation claim
-> anchoring claim
-> confirmation and authority claim
-> mutation claim
-> readback verification claim
-> terminal verdict claim

## Why this route exists

The project has repeatedly hit a context exhaustion loop:

- main Codex thread reads too many files before editing
- context fills just as implementation starts
- compression loses detailed read state
- Codex has to reread the same data
- development stalls

Route 202 must explicitly require parallel subagents before editing and after editing.

The main Codex thread must not perform an unbounded repository survey. It should coordinate, choose the smallest implementation path, and edit after receiving concise subagent reports.

## Required subagent workflow

### Before editing

Use parallel subagents before touching code.

Run at least four independent read-only subagents in parallel:

1. Provider Handoff Subagent
   Purpose:
   Find the exact Route 199 provider boundary and adapter approval path that reached provider-called=true.
   Must inspect:
   - scripts/verify-real-provider-anchored-smoke.mjs
   - scripts/real-provider-smokes/anchoredSmokeRunner.ts
   - provider readiness and adapter approval modules used by Route 199
   - openai-compatible provider adapter or provider call wrapper
   Must report:
   - exact call path that sets provider-called=true
   - required env flags
   - where raw provider output is excluded
   - how output validation and anchor quality are computed
   - minimal function or adapter that Route 202 should reuse
   Must not:
   - propose broad provider refactors
   - read unrelated browser, MCP, or old route docs

2. Task Loop Subagent
   Purpose:
   Explain why Route 200 reports provider-called=false and where task-loop runtime stops.
   Must inspect:
   - scripts/verify-real-provider-task-loop-mvp.mjs
   - scripts/real-provider-smokes/taskLoopRunner.ts
   - realTaskLoopPlan.ts
   - realTaskLoopRuntime.ts
   - realTaskLoopResult.ts
   - realTaskLoopScorecard.ts
   Must report:
   - exact branch causing provider-called=false
   - whether provider readiness is ignored, skipped, or gated incorrectly
   - whether confirmation is checked before proposal exists
   - where apply and verification are prevented
   - minimal changes needed for live no-apply and trusted confirmed apply

3. Apply and Verification Subagent
   Purpose:
   Find the safest existing exact apply and readback verification lanes to reuse.
   Must inspect:
   - editProposalApply.ts
   - providerAnchoredProposal.ts
   - proposalHunkSetRoute.ts
   - fencedEditRoute.ts
   - targetSetEditRoute.ts
   - exactHunkApply.ts
   - patchResult/workspaceWriteRoute.ts
   - editSnapshot.ts
   - verificationCommandResult.ts or readback verification modules
   Must report:
   - existing route that can apply a single exact anchored change in a controlled temp workspace
   - how final stale-read or anchor readback is enforced
   - how snapshot or recovery evidence is emitted
   - how readback verification can prove new text exists and old text is absent
   Must not:
   - introduce a new writer
   - use broad or fuzzy apply
   - mutate production workspace

4. Result and Session Truthfulness Subagent
   Purpose:
   Ensure terminal verdict and continuation state cannot falsely report success.
   Must inspect:
   - resultMapper.ts
   - resultSurfaceModule.ts
   - sessionTerminalState.ts
   - sessionStateSurface.ts
   - stoppedSessionContinuity.ts
   - compactContinuitySummary.ts
   - continueShellActionRuntime.ts
   Must report:
   - fields required for success versus stopped
   - how partial apply, missing verification, failed verification, and confirmation-required should map
   - what session or continue evidence must be preserved
   - any result/session parity test that must be updated

Optional fifth subagent if useful:

5. Reference Subagent
   Purpose:
   Do a small reference scan only after the project subagents identify the local seam.
   Budget:
   - max 4 files total across source-claudecode, opencode, and gemini-cli
   Focus:
   - task-loop provider handoff
   - confirmation before apply
   - result surface for applied versus proposed changes
   Must not:
   - summarize whole reference repos
   - copy architecture wholesale

### Subagent output budget

Each subagent must return no more than:

- 12 bullet points
- 8 file references
- 1 recommended implementation seam
- 1 risk list

The main Codex thread must synthesize these reports into a short edit plan before editing.

### During editing

After subagent reports, stop reading broadly.

The main Codex thread may read only files named by the subagents, plus directly adjacent tests or type definitions required by compile errors.

If additional files are needed, state why and keep the read bounded.

### After editing

Use parallel review subagents before final response.

Run at least three independent review subagents:

1. Evidence Review Subagent
   Check that provider-called, output-validation, anchor-quality, confirmation, mutation-authority, apply, verification, mutation-scope, snapshot, recovery, and terminal verdict are derived from real execution state, not hardcoded markers.

2. Safety Review Subagent
   Check default no-provider/no-apply, no production workspace mutation, no provider call during apply, no new writer, no broad or fuzzy apply, no direct provider-generated write, no command allowlist expansion, and no manual private config reads.

3. Regression Review Subagent
   Check focused tests, default verifier, live no-apply verifier, trusted confirmed apply verifier, result-contract, build, diff, package guard, and status. Confirm that old Route 200 failure is no longer accepted as complete.

The final report must include a short section named Subagent findings and state which subagents were used, what they found, and what changed because of their findings.

## Expected outcome

By the end of Route 202, there must be three distinct modes.

### Mode A: default safe mode

Without explicit live opt-in:

- provider-called=false
- adapter-approved=false or not-run
- output-validation=not-run
- anchor-quality=none
- confirmation=not-run
- mutation-authority=not-granted
- apply=not-run
- verification=not-run
- mutation-scope=none
- terminal verdict is stopped or skipped, never success
- no private provider home is read
- no workspace mutation happens

### Mode B: live no-apply mode

With explicit live task-loop provider opt-in, but without trusted apply confirmation:

- provider-called=true
- provider-kind=openai-compatible
- adapter-approved=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready when provider output is usable
- confirmation=required
- mutation-authority=not-granted
- apply=not-run
- verification=not-run
- mutation-scope=none
- terminal verdict is stopped with confirmation-required, not generic task-loop-stopped
- raw provider output remains excluded
- provider call count is exactly the expected proposal call count

### Mode C: trusted confirmed controlled apply mode

With explicit live opt-in and explicit trusted confirmation:

- provider-called=true
- provider-kind=openai-compatible
- adapter-approved=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- confirmation=trusted-confirmed
- mutation-authority=granted-controlled-temp-workspace
- apply=succeeded
- changed-files contains only controlled temp workspace files
- verification=succeeded
- verification proves expected new text exists and old text is absent
- mutation-scope=controlled-temp-workspace
- snapshot=created or recovery=available
- provider-call-during-apply=false
- terminal verdict is verified-success only if all required claims are proven

## Claim upgrade table

The implementation must preserve this claim upgrade chain.

| Claim | Required evidence | If missing |
|---|---|---|
| Provider was called | live provider-called=true from reused approved adapter path | stopped/provider-not-called |
| Provider is approved | adapter-approved=true for openai-compatible | stopped/provider-not-approved |
| Proposal is usable | output-validation=valid-exact-single-target | stopped/invalid-proposal |
| Proposal is anchored | anchor-quality=exact-ready | stopped/anchor-not-ready |
| Apply is authorized | explicit trusted confirmation plus controlled temp workspace authority | stopped/authority-not-granted |
| Apply happened | existing exact apply lane reports apply=succeeded and changed files | stopped/apply-not-run or stopped/partial-apply |
| Verification passed | readback verification proves expected mutation | stopped/verification-failed or stopped/verification-not-run |
| Success is truthful | terminal verdict is derived from all claims | error if bypassed |

Do not allow any lower claim to imply a higher claim.

Provider-called does not imply apply.
Exact-ready does not imply mutation authority.
Confirmation does not imply verification.
Repair proposal does not imply repair applied.
Focused tests do not imply live task-loop success.

## Required docs

Read first, but do not over-read:

- docs/ACTIVE_CONTEXT.md
- docs/implementation-context/capability-flow-manifest.json
- docs/implementation-context/capability-recipes.md
- docs/foundation/foundation-risk-register.md
- docs/architecture/workspace-file-context-contract.md
- docs/architecture/cross-capability-result-flow.md
- docs/architecture/runtime-receipt-contract.md
- docs/architecture/tool-runtime-execution-flow.md

Read only if touched:

- docs/architecture/session-substrate-seams.md
- docs/architecture/future-edit-expansion-contract.md
- docs/architecture/verifier-module-extraction.md
- provider boundary docs if present
- result/session parity docs if present

Do not read by default:

- docs/agent-routes old route files
- docs/archive
- browser docs
- MCP docs
- GitNexus
- pi
- full source-claudecode tree
- full opencode tree
- full gemini-cli tree

## Reference scan

Use references only after local seams are identified.

Allowed reference pool:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli

Budget:

- max 4 files total unless the first implementation attempt fails
- no more than 90 minutes equivalent investigation before editing
- reference scan must be done by subagent, not main thread

Focus:

- provider to task-loop handoff
- explicit confirmation before apply
- apply result versus proposal result
- verification/result surface

Do not copy:

- full-permission default agent loops
- broad patch engines
- hidden provider config loading
- unrelated TUI or CLI features
- new external dependencies

## Owner modules

Primary:

- Provider / Model
- Provider Smoke / Task Loop
- Proposal Anchoring
- Proposal / Review
- Edit / Patch
- Verification / Runtime
- Result Surface
- Harness / Eval

Secondary:

- Workspace / File Context
- Permission / Policy
- Session / Continue

Avoid:

- Browser
- MCP
- broad CLI UX
- broad runMvpIntegratedFlow refactor

## Likely touched files

Likely task-loop files:

- scripts/verify-real-provider-task-loop-mvp.mjs
- scripts/real-provider-smokes/taskLoopRunner.ts
- packages/ts-shell/src/orchestration/realTaskLoopPlan.ts
- packages/ts-shell/src/orchestration/realTaskLoopRuntime.ts
- packages/ts-shell/src/orchestration/realTaskLoopResult.ts
- packages/ts-shell/src/orchestration/realTaskLoopScorecard.ts

Likely provider files:

- packages/ts-shell/src/core/shell/providerReadiness.ts
- packages/ts-shell/src/orchestration/realProviderProposalGate.ts
- packages/ts-shell/src/orchestration/realProviderProposalDryRun.ts
- packages/ts-shell/src/orchestration/providerOutputValidator.ts
- packages/ts-shell/src/orchestration/providerAnchoredProposal.ts
- scripts/real-provider-smokes/anchoredSmokeRunner.ts

Likely apply and verification files:

- packages/ts-shell/src/orchestration/editProposalApply.ts
- packages/ts-shell/src/orchestration/proposalHunkSetRoute.ts
- packages/ts-shell/src/orchestration/fencedEditRoute.ts
- packages/ts-shell/src/orchestration/exactHunkApply.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts
- packages/ts-shell/src/orchestration/editSnapshot.ts
- packages/ts-shell/src/orchestration/verificationCommandResult.ts

Likely result and harness files:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/orchestration/resultSurfaceModule.ts
- packages/ts-shell/src/core/shell/sessionTerminalState.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- scripts/verify/cases.mjs
- scripts/verify/index.mjs only if the gate registry requires it

Do not touch unless absolutely necessary:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- package.json
- lock files
- browser modules
- MCP modules

## Implementation tasks

### 1. Run read-only subagents

Before editing, run the required parallel subagents and collect concise reports.

The main thread must not do a broad manual scan.

### 2. Diagnose old Route 200 stop

Find the exact reason task-loop smoke reports provider-called=false despite live opt-in.

Classify the root cause as one of:

- real provider readiness not passed into task loop
- provider adapter approval path not reused
- task-loop runner forces default fake or skipped provider path
- confirmation gate runs before anchored proposal exists
- provider dry-run path cannot return proposal to task-loop runtime
- env flag mismatch
- scorecard reports stopped from missing intermediate claim
- other, with exact file and branch

### 3. Reuse Route 199 provider boundary

Connect task-loop runtime to the same approved openai-compatible provider boundary that made Route 199 provider-called=true.

Requirements:

- no duplicate provider config parser
- no manual private provider file reading outside existing approved path
- raw provider output remains excluded from final report
- provider readiness and adapter approval evidence is preserved
- live no-apply mode must reach provider-called=true before confirmation

### 4. Produce anchored task-loop proposal

Ensure live task-loop can turn provider output into a normalized anchored proposal.

Requirements:

- output-validation=valid-exact-single-target for the controlled fixture
- anchor-quality=exact-ready
- unsafe or review-only anchors must stop truthfully
- exact-ready remains no-write until confirmation

### 5. Implement confirmation and authority separation

Trusted confirmed apply must require all of:

- explicit live task-loop opt-in
- explicit trusted confirmation flag
- exact-ready anchored proposal
- controlled temp workspace authority
- final stale-read or anchor freshness check

If any is missing, stop before apply.

### 6. Apply through existing exact lane only

Use existing exact apply infrastructure.

Requirements:

- no new writer
- no broad apply_patch
- no fuzzy matching write
- no production workspace mutation
- no provider call during apply
- changed files must be confined to controlled temp workspace
- partial apply must not report success

### 7. Run readback verification

After apply, run deterministic readback verification.

It must prove:

- expected new text exists
- expected old text is absent
- changed path is inside controlled temp workspace
- verification receipt is tied to the mutation claim

Verification skipped or blocked cannot become success.

### 8. Emit proof-carrying result

The task-loop result and scorecard must include at least:

- provider-called
- provider-kind
- adapter-approved
- output-validation
- anchor-quality
- confirmation
- mutation-authority
- apply
- verification
- mutation-scope
- changed-files
- failed-files
- snapshot
- recovery
- provider-call-during-apply
- terminal-verdict
- not-proven-claims

### 9. Preserve session and result truthfulness

If terminal success is reported, it must be derived from proven claims.

Any of these must produce stopped, not success:

- provider-called=false
- output-validation not valid
- anchor-quality not exact-ready
- confirmation missing
- mutation-authority not granted
- apply not-run
- apply partial
- verification not-run
- verification failed
- mutation outside controlled temp workspace

### 10. Add regression coverage

Add or update focused tests for:

- default safe mode
- live no-apply provider-called mode
- confirmation-required stop
- trusted confirmed controlled apply
- readback verification success
- provider-call-during-apply=false
- no production workspace mutation
- false-success guard when verification is missing
- false-success guard when provider-called=false
- false-success guard when apply is partial

## Boundaries

Hard boundaries:

- no provider call by default
- no apply without explicit trusted confirmation
- no production workspace mutation
- no new writer
- no broad apply_patch
- no fuzzy direct mutation
- no automatic repair apply
- no hidden provider config loading
- no manual private provider config reads
- no raw provider output in final logs
- no command allowlist expansion
- no browser work
- no external MCP work
- no new dependencies
- no package script churn unless strictly required for the verifier
- no broad runMvpIntegratedFlow refactor
- no broad SessionManager refactor
- no CLI productization in this route

Aggressive means:

- fewer abstractions
- real provider call in live opt-in mode
- real controlled temp workspace apply in trusted mode
- real readback verification
- one larger vertical slice

Aggressive does not mean:

- default full permission
- production workspace writes
- unsafe fuzzy mutation
- bypassing result truthfulness

## Validation

Run the smallest meaningful set first, then expand.

Required local checks:

- targeted task-loop unit or integration tests
- targeted provider adapter handoff tests
- targeted anchored proposal tests
- targeted exact apply/readback verification tests
- targeted result truthfulness tests

Required script checks:

- rtk node --check scripts/verify-real-provider-task-loop-mvp.mjs
- rtk node scripts/verify-real-provider-task-loop-mvp.mjs
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Required live no-apply check when local provider config is available:

Run the task-loop verifier with explicit live opt-in and no trusted apply confirmation.

Expected:

- provider-called=true
- provider-kind=openai-compatible
- adapter-approved=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- confirmation=required
- apply=not-run
- verification=not-run
- terminal verdict is stopped or confirmation-required

Required trusted confirmed controlled apply check when local provider config is available:

Run the task-loop verifier with explicit live opt-in and trusted apply confirmation.

Expected:

- provider-called=true
- provider-kind=openai-compatible
- adapter-approved=true
- output-validation=valid-exact-single-target
- anchor-quality=exact-ready
- confirmation=trusted-confirmed
- mutation-authority=granted-controlled-temp-workspace
- apply=succeeded
- verification=succeeded
- mutation-scope=controlled-temp-workspace
- provider-call-during-apply=false
- terminal verdict is verified-success

If live provider config is unavailable, do not fake live success. Report live checks as not-run with exact reason, and ensure fake/default/focused tests are labeled correctly.

## Regression markers

The following old state is explicitly not complete:

- provider-called=false
- anchor-quality=none
- apply=not-run
- verification=not-run
- status=task-loop-stopped

Focused tests passing is not enough.

Default-safe skip passing is not enough.

Fake-ready provider-called is not enough.

A scorecard object existing is not enough.

A provider proposal existing is not enough.

Exact-ready without confirmation is not enough.

Apply without readback verification is not enough.

Verification without controlled mutation evidence is not enough.

## Final report

Final response must include:

1. Subagent findings
   - which pre-edit subagents ran
   - shortest useful finding from each
   - which post-edit review subagents ran
   - what each review found

2. Root cause
   - why Route 200 reported provider-called=false
   - exact file and branch responsible

3. Implementation summary
   - provider handoff
   - proposal validation
   - anchoring
   - confirmation and authority
   - apply
   - verification
   - result/session truthfulness

4. Evidence table

Include this table:

| Mode | provider-called | anchor-quality | confirmation | apply | verification | terminal verdict |
|---|---|---|---|---|---|---|
| default | ... | ... | ... | ... | ... | ... |
| live no-apply | ... | ... | ... | ... | ... | ... |
| trusted confirmed | ... | ... | ... | ... | ... | ... |

5. Validation

List exact commands run and pass/fail.

6. Safety boundaries

Explicitly confirm:

- no provider call by default
- no production workspace mutation
- no new writer
- no fuzzy apply
- no provider call during apply
- raw provider output excluded
- no broad runMvp refactor

7. Remaining risks

Be honest about any not-proven claim.

8. Next route recommendation

Recommend the next route only after Route 202 evidence is clear.

