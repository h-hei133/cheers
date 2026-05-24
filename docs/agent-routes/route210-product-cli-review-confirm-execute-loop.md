# Route 210: Product CLI Review-Confirm-Execute Loop

## Goal

Turn the Route208/209 product-path planning and mutation handoff into a usable CLI review-confirm-execute loop.

Route208 proved real product-path planning for vague tasks.
Route209 proved structured planning mutation handoff can be consumed by the proof-carrying backend.

Route210 must make this usable from the product CLI/session path:

vague user task
-> Planning Runtime product path
-> structured handoff
-> user-visible review surface
-> explicit confirmation
-> existing proof-carrying backend
-> readback verification
-> Claim Ledger/result verdict
-> session/continue evidence

Default remains no-write/review-only. Execution requires explicit confirmation and controlled workspace authority.

This route is not about adding another demo. It is about user-visible product flow.

## Completion rule

COMPLETE only if product path evidence proves:

- CLI/session output shows reviewable planning handoff
- user can explicitly confirm a controlled execution path
- confirmed execution uses existing Route203-206/Route209 backend seam
- readback verification runs
- terminal/result/session surface distinguishes review-only, confirmation-required, applied, verified, failed, and repair-ready states
- default mode remains no-write
- no new writer or fuzzy direct apply is introduced

PARTIAL if only tests/demo/internal route can execute.

BLOCKED if safe confirmation or product CLI seam cannot be found.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign subagents to study local seams and relevant reference repos.
2. Implement that phase.
3. Validate.
4. Run audit subagent.
5. If green, commit with message starting route210:.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Final report must list phase commits and git status.

## Reference repository pool

All repos are under /home/wang/projects:

- GitNexus
- OpenHands
- gemini-cli
- graphiti
- inspect_ai
- mem0
- mempalace
- mini-swe-agent
- opencode
- pi
- playwright-mcp
- stagehand

Use by capability:

- CLI review/approval/product loop: opencode, OpenHands, gemini-cli
- edit confirmation/apply loop: mini-swe-agent, OpenHands, opencode
- result/session surfaces: opencode, OpenHands, inspect_ai
- task trajectory and audit reports: inspect_ai, OpenHands
- context-to-action continuity: gemini-cli, mem0, mempalace only if directly needed

Main thread must not broad-read reference repos. Subagent reports must be short.

## Scope

Allowed:

- packages/ts-shell broadly
- CLI/session/result light wiring
- runMvpIntegratedFlow careful product-path integration
- Planning Runtime product projection
- Route209 planning mutation proof route
- approval/confirmation modules
- session/result/continue surfaces
- focused benchmark or verifier updates

Avoid unless necessary:

- large cli.tsx refactor
- large SessionManager refactor
- large runMvpIntegratedFlow refactor

Not allowed:

- provider call by default
- apply by default
- command dispatch by default
- production workspace writes by default
- new writer
- fuzzy direct mutation
- new dependencies
- browser/MCP product work
- broad Claim Ledger expansion unless needed to avoid false success

## Phase 0: Route209 reality audit and product UX baseline

Purpose:

Confirm Route209 backend handoff is real and identify the product CLI/session seam for review/confirmation.

Subagents:

- Route209 backend reality audit subagent
- CLI/session review surface subagent

Must answer:

- is Route209 trusted controlled proof product-path or benchmark-only?
- what is the structured handoff shape?
- where should review output be rendered?
- where can explicit confirmation be accepted?
- what session/result evidence is currently missing?

Deliverable:

- baseline table
- chosen product seam
- non-completion risks

Optional commit:

- route210: baseline review confirm seams

## Phase 1: User-visible review surface

Purpose:

Make the product CLI/session path show a reviewable mutation handoff.

Implementation target:

- show task summary
- candidate/edit targets
- target rationale
- expected change summary
- proposal/anchor state when available
- verification intent
- handoff state
- no-write markers
- explicit next action for confirmation

Acceptance:

- real CLI/read-inspect/no-write output shows review surface
- review surface is based on structured handoff, not duplicated display-only data
- explicit-target path remains stable
- command-only tasks do not show mutation confirmation

Audit:

- check review output cannot imply apply or verification

Optional commit:

- route210: surface reviewable planning handoff

## Phase 2: Explicit confirmation contract

Purpose:

Add a product-safe confirmation mechanism for controlled execution.

Implementation target:

- confirmation is explicit and visible
- confirmation scope is controlled workspace only
- confirmation cannot be inferred from planning
- print/no-interactive mode stays review-only unless explicit trusted flag/input exists
- interactive mode may prompt if existing approval infrastructure supports it
- denial or missing confirmation stops cleanly

Acceptance:

- default remains confirmation-required/no-write
- confirmed mode records confirmation evidence
- missing confirmation cannot apply
- confirmation does not call provider or dispatch commands by itself

Audit:

- check confirmation cannot be spoofed by prompt text
- check no production write enablement by default

Optional commit:

- route210: add explicit controlled confirmation contract

## Phase 3: Confirmed execution through existing proof backend

Purpose:

Send confirmed handoff to existing proof-carrying backend.

Implementation target:

- use Route209 backend seam
- use existing exact/proposal apply lane
- no new writer
- no fuzzy direct apply
- controlled workspace only
- provider-call-during-apply=false
- partial failure remains truthful

Acceptance:

- confirmed controlled product path reaches backend
- apply state is visible
- changed files are controlled
- default path still does not apply

Audit:

- check execution is not benchmark-only
- check backend consumption is real

Optional commit:

- route210: execute confirmed handoff through proof backend

## Phase 4: Verification, result, and session verdict surface

Purpose:

Make execution result clear and continuation-safe.

Implementation target:

- readback verification result shown
- Claim Ledger/result verdict shown
- applied but unverified cannot success
- confirmation-required is stopped, not success
- failed verification shows repair-ready or follow-up state if available
- session/continue preserves review/execution/verification evidence

Acceptance:

- product output distinguishes review-only, confirmation-required, applied, verified, failed, repair-ready
- session/result tests prove evidence is preserved
- no false success when verification missing

Audit:

- check terminal state derives from runtime evidence
- check final success does not hide failure history

Optional commit:

- route210: surface execution verdict and continuation evidence

## Phase 5: Product benchmark

Purpose:

Prove the review-confirm-execute loop with product-path cases.

Benchmark cases:

- vague bugfix review-only default
- vague bugfix confirmed controlled execution
- vague feature review-only or missing-context
- insufficient-context stops before confirmation
- command-only bypasses mutation confirmation
- verification failure or blocked verification cannot success

Each case reports:

- product path used
- review surface present
- confirmation state
- backend consumption state
- apply state
- verification state
- terminal verdict
- session/continue evidence
- safety markers

Acceptance:

- benchmark proves product-path review-confirm-execute behavior
- no demo-only completion
- default no-write remains proven

Audit:

- final benchmark audit separates review, confirmation, apply, verification, result, and session evidence

Optional commit:

- route210: add review confirm execute benchmark

## Phase 6: Final audit

Final audit subagent must answer:

- Is review surface product-path or display-only?
- Can default path write? It must not.
- Is confirmation explicit?
- Does confirmed execution use existing backend?
- Is readback verification real?
- Does result/session preserve evidence?
- Which paths remain not-proven?
- Any new writer, fuzzy apply, provider default call, or command dispatch?

Final status must be COMPLETE / PARTIAL / BLOCKED.

Optional commit:

- route210: final audit adjustments

## Required validation

Final validation should include:

- review surface tests
- confirmation contract tests
- confirmed backend execution tests
- verification/result/session tests
- explicit-target regression
- command-only bypass regression
- Route209 benchmark
- Route210 benchmark
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Run real CLI or equivalent integrated invocation where possible.

If interactive prompt cannot be tested safely, use explicit non-interactive trusted confirmation and label interactive coverage not-proven.

## Final report

Do not paste full stdout.

Include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase summary
3. Phase commits
4. Reference repos studied by phase
5. Product review surface
6. Confirmation contract
7. Confirmed backend execution
8. Verification/result/session behavior
9. Benchmark results
10. Default no-write evidence
11. Commands run with pass/fail and key fields
12. Files changed
13. Remaining not-proven claims
14. Next route recommendation
