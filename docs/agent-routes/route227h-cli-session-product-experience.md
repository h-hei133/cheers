# Route 227H: CLI Session Product Experience

## Goal

Turn the accumulated Route227A-G capabilities into a strong user-facing CLI/session experience.

Route227A-G improve provider, context/planning, proposal, edit, verification, repair, and external tools.

Route227H must make those capabilities understandable and usable from the actual product surface:

real CLI / print / session path
-> clear plan
-> proposal review
-> authority prompt / explicit flags
-> apply status
-> verification status
-> repair status
-> tool receipts
-> final verdict
-> continuation state
-> human-readable not-proven claims

Expected final status: COMPLETE.

This route is about product experience, not another backend capability runner.

## Current gap

The project has many product composition roots and evidence surfaces, but the user experience can still feel like internal plumbing:

- output may be too marker-heavy
- flags may be hard to understand
- plan/proposal/apply/verify/repair/tool phases may not read as one flow
- review-ready can be confused with apply-ready
- not-proven claims can be too technical
- session continuation can preserve data but not present it clearly
- repair-required may not feel actionable
- tool receipts may not be visible or understandable
- partial/stopped states can be hard to distinguish from failure
- live provider limitations may not be explained clearly

Route227H must turn the current system into a coherent product interaction while preserving truthfulness.

## Capability to build

Build a user-facing CLI/session experience layer.

Required capabilities:

1. Unified output structure
   CLI / print / session output should show:
   - Task
   - Context
   - Plan
   - Proposal
   - Authority needed
   - Apply
   - Verification
   - Repair
   - Tools
   - Verdict
   - Not proven
   - Next action

2. Review surface
   Proposal review should clearly show:
   - proposal source
   - target files
   - operation type
   - anchor quality
   - risk / unsupported parts
   - required authority
   - verification intent
   - whether this is review-only or ready-for-authority
   Do not print raw provider output or secrets.

3. Authority UX
   Make authority explicit and understandable:
   - selected workspace apply authority
   - verification command authority
   - repair authority
   - browser/tool side-effect authority
   - live provider opt-in
   Prompt text alone must not grant authority.
   Explicit flags or interactive confirmation must map to product authority contracts.

4. Verification UX
   Show:
   - selected command
   - why it is relevant
   - dispatch status
   - result
   - coverage / not covered files
   - failure class
   - repair handoff if failed

5. Repair UX
   Show:
   - original failure
   - repair proposal source
   - confirmation required
   - repair apply status
   - post-repair verification
   - verified-success-with-repair or repair-failed/blocked
   - original failure preserved

6. Tool receipt UX
   Show:
   - tool requested
   - local/external classification
   - policy decision
   - execution status
   - relevance
   - result impact
   - not-proven claims

7. Session continuation UX
   Session continuation should preserve and display:
   - stopped reason
   - failed verification
   - repair-required state
   - pending authority
   - not-proven claims
   - compact evidence summary
   - next action

8. Human-readable verdicts
   Translate internal states into clear user language:
   - verified success
   - verified success with repair
   - stopped: needs authority
   - stopped: missing context
   - stopped: provider output insufficient
   - stopped: verification failed
   - partial: some files changed, some failed
   - blocked: unsupported broad task
   - not proven

9. Product path integration
   This must work in real CLI / print / session path, not only in scripts.

## Required subagents

Use focused subagents.

Before implementation:

1. CLI UX subagent
   Inspect cli.tsx, print/session output, cli planning mutation execution, and result projection.
   Report the smallest path to produce coherent phase-based output.

2. Session continuity subagent
   Inspect SessionManager, session runtime, continuation summaries, compact summaries, stopped continuation, and repair/session evidence.
   Report how to make continuation readable and truthful.

3. Authority and verdict subagent
   Inspect authority flags, confirmation contracts, resultMapper, terminal state, and not-proven claim surfaces.
   Report how to make authority/verdict human-readable without weakening policy.

After implementation:

1. UX truthfulness audit subagent
   Check output does not make review-ready look like applied, intent look like dispatched, or repair-required look like repaired.

2. Session audit subagent
   Check continuation preserves stopped reason, failure, repair, verification, tool receipts, and not-proven claims.

3. Redaction/policy audit subagent
   Check no provider secrets, raw provider output, raw oldText/newText, or excessive command/tool output leaks.

Each subagent should return short findings, changed seams, risks, and audit result.

## Reference policy

No broad reference scan.

Reference pool under /home/wang/projects:

- opencode
- gemini-cli
- OpenHands
- mini-swe-agent
- inspect_ai

Suggested mapping:

- opencode: CLI permission and tool execution UX
- gemini-cli: CLI context/planning and memory display
- OpenHands: action/observation trajectory presentation
- mini-swe-agent: minimal terminal flow
- inspect_ai: verdict/report readability

If references are inspected, final report must include reference adoption table.

If not inspected, state:

not-inspected; local Route225-227G substrate was sufficient.

## Phases

### Phase 1: UX audit and output contract

Goal:

Define the CLI/session output contract.

Do:

- inspect current CLI print/session output
- inspect planning mutation execution output
- inspect result/session terminal surface
- inspect continuation summaries
- inspect repair and verification surfaces
- inspect tool receipt surfaces if Route227G implemented them
- define a phase-based output model

Output model sections:

- Task
- Context
- Plan
- Proposal
- Authority
- Apply
- Verification
- Repair
- Tools
- Verdict
- Not proven
- Next action

Focused audit:

- no hidden success wording
- no internal marker wall without explanation
- no loss of machine-readable evidence

### Phase 2: Proposal and authority UX

Goal:

Make proposal review and authority requirements clear.

Do:

- update review output for proposal source, target files, operation type, anchor quality, verification intent, and blockers
- show whether proposal is review-only, ready-for-authority, or blocked
- show selected workspace apply authority requirement
- show verification authority requirement
- show repair authority requirement
- show live provider opt-in requirement
- keep explicit authority contract separate from prompt text

Product evidence:

- one no-authority task clearly stops at needs-authority
- one authorized task clearly proceeds
- review-ready is not displayed as applied

Focused audit:

- authority language does not imply automatic apply
- exact-ready does not imply mutation authority
- raw provider output and patch details remain redacted when required

### Phase 3: Verification, repair, and tool UX

Goal:

Make execution evidence understandable.

Do:

- show selected verification command and relevance
- show dispatch status and exit result summary
- show failure class and repair handoff
- show repair proposal, confirmation, apply, re-verification, and final repair verdict
- show tool receipt classification and relevance
- show local/external/focused/live labels in human-readable form
- show not-proven coverage

Product evidence:

- passing verification is displayed as verification passed
- failing verification is displayed as verification failed and repair-required
- command-only bypass is displayed as rejected
- repair-to-success shows original failure and post-repair verification
- tool receipt shows evidence source and relevance if Route227G available

Focused audit:

- command selected is not command dispatched
- repair proposal is not repair success
- tool success is not task success unless relevant

### Phase 4: Session continuation and compact summary UX

Goal:

Make continuation useful and truthful.

Do:

- update continuation summary to carry phase evidence
- preserve stopped reason
- preserve pending authority
- preserve failed verification and repair-required state
- preserve not-proven claims
- preserve tool receipts where available
- preserve provider/live/fake evidence labels
- display next action clearly

Product evidence:

- stopped task continuation shows why it stopped and what to do
- repair-required continuation shows failure and repair next action
- partial multi-file task continuation shows changed/failed/unattempted files
- compact summary does not erase evidence

Focused audit:

- continuation does not upgrade partial to success
- compact summary does not hide failed verification
- session replay does not lose authority requirements

### Phase 5: Verdict language and user-facing truthfulness

Goal:

Make verdicts clear without weakening evidence.

Do:

- map internal verdicts to human language
- preserve machine-readable status
- show not-proven claims plainly
- show capability limitations plainly
- distinguish COMPLETE / PARTIAL / BLOCKED / NOT-PROVEN
- make successful tasks concise
- make failed tasks actionable

Example verdict language:

- Verified success: changes were applied and relevant verification passed.
- Verified success with repair: initial verification failed, repair was applied, and re-verification passed.
- Stopped: approval required before applying changes.
- Partial: some required files changed or verified, but others did not.
- Blocked: this operation is unsupported or unsafe in the current mode.
- Not proven: the system did not gather enough evidence to claim success.

Product evidence:

- at least 5 verdict classes render clearly
- not-proven claims are understandable
- failure next actions are useful

Focused audit:

- pretty language does not overclaim
- machine report and human output agree
- user-facing output remains truthful

### Phase 6: CLI/session product task pack

Goal:

Run a small product UX task pack through the real path.

Task pack:

1. no-write planning task
2. review-ready proposal task
3. needs-authority apply task
4. authorized apply + verification task
5. verification failure -> repair-required task
6. repair-to-success task if Route227F exists
7. tool receipt task if Route227G exists
8. unsupported broad task
9. session continuation task

Product evidence:

- CLI/print/session output uses the new structure
- frozen lower-bound tasks remain truthful
- route-local runner is not primary evidence

Focused audit:

- output is product path, not script-only
- result/session agree
- no false success

### Phase 7: Route227H report and handoff to Route227I

Create:

docs/implementation-context/route227h-cli-session-product-experience-report.json

Report must include:

- schemaVersion
- route=route227h
- routeType=cli-session-product-experience
- finalStatus
- primaryEvidence
- cliProductTasksAttempted
- sessionContinuationEvidence
- uxSurfaceEvidence
- authorityUxEvidence
- verificationUxEvidence
- repairUxEvidence
- toolUxEvidence
- verdictLanguageEvidence
- frozenTasksAttempted
- routeLocalTasksAdded
- requiredNegativeControls
- taskVerdicts
- notProvenClaims
- referenceAdoption if references were inspected

Run:

- npm run verify:route221-anti-false-success-gate
- npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route227h-cli-session-product-experience-report.json
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Add a route227h verifier only if useful. It must drive real CLI/session path or remain secondary.

## Required frozen tasks

Load frozen tasks from:

docs/implementation-context/frozen-capability-tasks-route221.json

Attempt at least:

- frozen-lower-bound-stable-explicit-no-provider-no-apply
- frozen-lower-bound-stable-selected-workspace-authority-case
- frozen-command-only-bypass-negative-control
- frozen-session-continuity-result-truth
- frozen-unsupported-broad-task-negative-control

Recommended if cheap:

- frozen-upper-bound-challenge-verification-failure-repair-case
- frozen-upper-bound-challenge-multi-file-case

These protect user-facing truthfulness while UX improves.

## Completion criteria

Route227H is COMPLETE only if:

- real CLI/print/session product path consumes the UX surface
- at least 7 CLI/session product tasks are attempted
- at least 5 distinct verdict classes render clearly
- proposal review shows source, targets, anchor, authority, verification intent, and blockers
- no-authority task stops clearly without applying
- authorized task proceeds clearly
- verification pass/fail is displayed correctly
- repair-required or repair-to-success is displayed truthfully if route substrate exists
- tool receipt is displayed truthfully if Route227G substrate exists
- session continuation preserves stopped reason, failed verification, pending authority, and not-proven claims
- command-only bypass remains rejected
- unsupported broad task remains blocked
- human-readable output does not conflict with machine-readable evidence
- route-local demos are not primary evidence
- Route221 report gate passes
- final report justifies COMPLETE from product UX evidence

If real CLI/session path cannot safely consume these surfaces, final status must be PARTIAL or BLOCKED with exact reason.

## Scope

Allowed:

- CLI print/session output surface
- result/session projection
- approval/authority display
- verification display
- repair display
- tool receipt display
- compact/continuation summary
- verdict language
- product task pack report
- focused tests for CLI/session output and truthfulness

Avoid unless necessary:

- new backend capabilities owned by Route227A-G
- live provider work
- edit engine work
- verification intelligence work
- repair logic work
- browser/MCP backend work
- broad Claim Ledger rewrite

Not allowed:

- hiding not-proven claims for prettier UX
- review-ready displayed as applied
- verification intent displayed as dispatched
- repair-required displayed as repaired
- tool receipt displayed as task success without relevance
- session continuation upgrading partial to success
- raw provider output logging
- raw oldText/newText logging
- secrets or excessive command/tool output
- route-local UX demo as primary COMPLETE evidence
- new dependencies unless already approved by project policy

## Phase commit policy

Codex may commit a green phase to keep worktree readable.

Commit rules:

- commit message starts with route227h:
- do not push
- do not commit failing states
- do not commit audit residue
- final report lists phase commits

Commits are optional, not mandatory.

## Final report

Do not paste full stdout.

Do not print secrets, raw provider output, unsafe patch contents, or excessive command/tool output.

Include:

1. Final status
2. Phase commits
3. UX baseline gaps
4. Output structure implemented
5. Proposal/review UX
6. Authority UX
7. Verification UX
8. Repair UX
9. Tool receipt UX
10. Session continuation UX
11. Verdict language
12. Product path task pack results
13. Frozen tasks attempted
14. Negative controls
15. Route221 gate result
16. Reference adoption table or not-inspected statement
17. Validation commands with pass/fail
18. Files changed
19. Remaining not-proven claims
20. What capability increased
21. What lower-bound safety was preserved
22. Next route: docs/agent-routes/route227i-final-capstone-release-candidate.md

## Next route

After Route227H is complete, continue with:

docs/agent-routes/route227i-final-capstone-release-candidate.md

Route227I will freeze the final release-candidate capability map by running frozen tasks, capstone tasks, live provider tasks, CLI/session tasks, verification/repair/tool tasks, negative controls, and a final independent evidence audit.
