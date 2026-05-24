# Route 209: Planning Runtime to Proof-carrying Mutation Backend Handoff

## Goal

Connect the Route208 product-path Planning Runtime to the existing Route203-206 proof-carrying mutation backend.

Route208 made vague tasks enter the real product path and produce candidates, staged context, grounded analysis, executable plan, edit targets, verification intent, and review-only handoff.

Route209 must make that handoff real.

The target flow is:

vague user task
-> product-path Planning Runtime
-> structured edit handoff
-> proposal preparation
-> exact anchoring
-> review/confirmation
-> existing proof-carrying mutation backend
-> readback verification
-> Claim Ledger verdict

Default remains no-write and review-only. But the route must prove that planning output is not just display text: it can be consumed by the existing mutation/proposal backend when explicitly allowed.

## Hard completion rule

Codex may not mark COMPLETE unless product-path handoff evidence exists.

Complete requires:

- real product path produces a structured mutation handoff from Planning Runtime output
- the handoff is consumed by existing proposal/anchoring/apply infrastructure, not only printed
- default CLI/read-inspect path remains no-write/review-only
- explicit trusted controlled mode can reach existing proof backend, or if live/provider config is unavailable, a focused product-path equivalent proves the same handoff contract
- result/session output distinguishes planning-only, handoff-ready, confirmation-required, applied, verified, failed, and unsupported states
- no new writer is introduced
- no fuzzy direct mutation is introduced

If implementation is useful but only module/demo/focused-test proven, final status is PARTIAL.

If safe product-path backend handoff seam cannot be found, final status is BLOCKED.

## Phase and commit policy

Execute in phases.

For each phase:

1. Assign subagents to inspect local seams and relevant reference repos.
2. Main thread synthesizes findings.
3. Implement the phase.
4. Run focused validation.
5. Run an audit subagent.
6. If green, Codex may create a git commit before continuing.

Commits are allowed and encouraged after green audited phases.

Rules:

- Do not push.
- Do not commit failing states.
- Do not squash phase commits.
- Commit messages must start with route209:
- Final report must list phase commits and final git status.

## Reference repository pool

All reference repos are under /home/wang/projects:

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

Use references by capability. Do not broad-read all repos in the main thread.

Recommended mapping:

- planning to action loop: OpenHands, mini-swe-agent, opencode
- patch proposal and edit loop: mini-swe-agent, OpenHands, opencode
- permission and confirmation: opencode, OpenHands
- result/eval surface: inspect_ai, OpenHands
- context-to-edit target reasoning: gemini-cli, GitNexus, pi
- memory only if directly needed: mem0, mempalace, graphiti

Subagent reports must be short:

- pattern found
- best reference repo
- local seam
- implementation recommendation
- audit risk

## Scope

Allowed:

- packages/ts-shell broadly
- runMvpIntegratedFlow small and careful integration
- Planning Runtime and product projection
- proposal/anchoring/review/apply handoff modules
- result/session surfaces
- focused verifier or benchmark updates if needed

Avoid unless necessary:

- large runMvpIntegratedFlow refactor
- large SessionManager refactor
- large cli.tsx refactor

Not allowed:

- new writer
- fuzzy direct mutation
- broad arbitrary refactor
- production workspace write enablement by default
- provider call by default
- command dispatch by default
- new dependencies
- browser/MCP product work
- broad Claim Ledger expansion unless required to prevent false success

## Phase 0: Baseline and handoff contract

Purpose:

Establish the current Route208 handoff shape and define what backend consumption means.

Subagents:

- product planning handoff subagent
- mutation backend seam subagent

Must answer:

- what edit target data Planning Runtime currently emits
- whether that data is structured or display-only
- what existing Route203-206 backend inputs require
- where proposal/anchoring/apply handoff should occur
- what states must be product-visible

Deliverable:

- handoff contract table
- backend seam decision
- not-proven claims

Audit:

- ensure completion is not redefined as display-only output

Optional commit:

- route209: baseline planning handoff contract

## Phase 1: Structured planning mutation handoff

Purpose:

Turn Planning Runtime edit targets into a structured handoff object.

Implementation target:

- target files
- target rationale
- relevant context receipts
- read evidence ids
- expected change summary
- verification intent
- unsupported reasons
- readiness state: planning-only, handoff-ready, unsupported, missing-context
- no mutation authority granted by planning alone

Acceptance:

- product path emits structured handoff, not only text
- command-only and unsupported tasks do not produce mutation-ready handoff
- explicit-target paths remain stable

Audit:

- check handoff cannot imply apply or verification

Optional commit:

- route209: add structured planning mutation handoff

## Phase 2: Proposal preparation and anchoring bridge

Purpose:

Feed the structured handoff into existing proposal and anchoring infrastructure.

Reference focus:

- mini-swe-agent patch loop
- OpenHands controller/edit feedback
- opencode tool and permission flow

Implementation target:

- convert handoff into proposal request or proposal preparation input
- reuse existing provider/proposal/anchoring seams where possible
- no provider call by default
- fake/focused proposal path may be used for deterministic validation if clearly labeled
- optional live provider path only under existing explicit opt-in
- exact-ready remains handoff readiness, not mutation authority

Acceptance:

- product path can reach proposal-prepared or confirmation-required state
- anchoring state is surfaced through product output
- invalid/unsupported proposals stop truthfully

Audit:

- check proposal prepared is not counted as applied
- check fake/focused evidence is not labeled live

Optional commit:

- route209: bridge planning handoff to proposal anchoring

## Phase 3: Confirmation and controlled proof backend handoff

Purpose:

Allow explicit trusted confirmation to send an exact-ready proposal to the existing proof-carrying mutation backend.

Implementation target:

- require explicit confirmation
- require exact-ready anchored proposal
- require controlled workspace authority
- use existing exact hunk/target-set/proposal apply lanes
- no new writer
- no fuzzy apply
- no provider call during apply
- no production workspace mutation by default

Acceptance:

- default path stops at confirmation-required or review-only
- trusted controlled mode reaches existing backend
- changed files remain controlled
- partial failures are truthful

Audit:

- check planning did not grant mutation authority
- check apply goes through existing backend only

Optional commit:

- route209: connect confirmed handoff to proof backend

## Phase 4: Verification and Claim Ledger verdict

Purpose:

Make backend handoff produce truthful verification and terminal state.

Implementation target:

- readback verification tied to handoff target
- verification intent from Planning Runtime is preserved
- Claim Ledger or result surface derives terminal verdict
- applied but unverified cannot success
- proposal-only cannot success
- repair handoff remains separate if verification fails

Acceptance:

- verified success only after apply and readback verification
- confirmation-required is stopped, not success
- verification failed produces stopped or repair-ready state
- provider-call-during-apply remains false

Audit:

- check no result/session false success
- check original planning and handoff evidence remains visible

Optional commit:

- route209: verify handoff backend results

## Phase 5: Product-path benchmark

Purpose:

Prove Route209 on realistic product-path tasks.

Benchmark cases:

- vague bugfix produces handoff-ready target
- vague feature produces review-only handoff or unsupported with missing facts
- insufficient context stops before proposal
- unsupported broad refactor stops clearly
- command-only task bypasses mutation handoff
- trusted controlled fixture reaches proof backend and verification when safe

Each case reports:

- product path used
- edit targets
- handoff state
- proposal/anchor state
- confirmation state
- apply state
- verification state
- terminal state
- no-write/default safety markers

Acceptance:

- benchmark proves product-path handoff is real
- display-only handoff is not counted
- default mode remains no-write
- explicit confirmed controlled mode proves backend consumption if supported

Audit:

- final benchmark audit separates planning, proposal, anchor, apply, verification, and terminal evidence

Optional commit:

- route209: add product path mutation handoff benchmark

## Phase 6: Final audit

Final audit subagent must answer:

- Is Planning Runtime handoff consumed by backend code?
- Is any capability display-only?
- Which paths remain review-only?
- Which paths can reach confirmation-required?
- Which paths can reach controlled apply/verification?
- Which evidence is live, fake, focused, default-safe, product-path, or not-proven?
- Did any new writer or fuzzy apply appear?
- Did any product path bypass result/session truthfulness?

Final status must be COMPLETE / PARTIAL / BLOCKED.

Optional commit:

- route209: final audit adjustments

## Required validation

Run targeted checks during phases.

Final validation should include:

- Planning Runtime tests
- product-path handoff tests
- proposal/anchoring bridge tests
- controlled backend handoff tests
- verification/result tests
- explicit-target regression
- command-only bypass regression
- Route208 benchmark
- Route209 benchmark
- build for packages/ts-shell
- git diff --check
- git status --short --branch

Run real CLI or equivalent integrated invocation where possible.

If live provider config is unavailable, do not fake live success. Use focused/product-path equivalent and label it correctly.

## Final report

Do not paste full stdout.

Final report must include:

1. Final status: COMPLETE / PARTIAL / BLOCKED
2. Phase summary
3. Phase commits
4. Reference repos studied by phase
5. Handoff contract shape
6. Backend seam chosen
7. Product paths now reaching handoff
8. Product paths reaching proposal/anchor
9. Product paths reaching controlled apply/verification
10. Default no-write behavior
11. Benchmark results
12. Commands run with pass/fail and key fields
13. Files changed
14. Remaining not-proven claims
15. Next route recommendation
