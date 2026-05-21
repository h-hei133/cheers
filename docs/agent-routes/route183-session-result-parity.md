# Route 183: Session result parity

## Goal

Close the Result Surface / Session / Continue parity gap after the new context and planning surfaces.

Routes 181-182 added:

- targeted context packets
- context discovery
- context planning summaries
- Agent Plan facade
- missing-context / suggested-read surfaces
- replay-safe planning evidence

These improve Reading and Planning, but they also add new terminal and continuation facts. The next risk is drift between:

- Result Surface classification
- session terminal output
- compact summaries
- future-turn / continue seeds
- verifier assertions

Route 183 should establish a stronger parity layer so stopped/success/error details survive terminal rendering, compacting, and `/continue`.

This route owns:

- approval-denied compact Reason regression
- agent-plan / context-packet terminal parity
- missing-context and suggested-read continuity
- edit/proposal/repair terminal parity regression coverage
- shared terminal detail projection where safe
- session compact / future-turn evidence tests
- verifier coverage for session/result parity

This is not a new capability route. It is a reliability route for user-visible truthfulness.

## Expected outcome

By the end of Route 183:

1. Approval-denied compact output includes the expected Reason / do-next details again.
2. Context packet and Agent Plan stopped surfaces render consistently in terminal, compact, and continue.
3. Missing-context / suggested-read evidence survives future-turn projection without raw file content.
4. Edit proposal / repair / hunk-set stopped summaries keep their blocker and do-next text.
5. Session terminal state consumes Result Surface-owned classification instead of duplicating divergent logic.
6. `/continue` can explain the previous stopped reason for approval, context, planning, edit, and verification paths.
7. Verifier coverage catches future terminal / compact / continue drift.
8. No product capability expands.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`

Read only if touched:

- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/resultmapper-module-extraction.md`
- `docs/architecture/tool-policy-result-contract.md`

Do not load browser/provider/edit-history docs unless a touched file proves they are needed.

## Reference scan

Use references only for session, compact, transcript, terminal-result, and trajectory parity.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 8 files
- OpenHands: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 4 files
- mini-swe-agent: max 4 files

Focus:

- session compact summaries
- terminal/result message projection
- event / trajectory persistence
- replay-safe observations
- stopped/error reason preservation
- user-facing result truthfulness

Do not copy hidden chain-of-thought persistence, broad session schema rewrites, or autonomous replay behavior.

## Owner modules

Primary owners:

- Result Surface
- Session / Continue

Collaborating owners:

- Agent Loop
- Workspace / File Context
- Permission / Policy
- Edit / Patch
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/core/shell/sessionResultParity.ts`
- `packages/ts-shell/src/core/shell/sessionResultParity.test.ts`
- `packages/ts-shell/src/session/continuationEvidenceParity.ts`
- `packages/ts-shell/src/session/continuationEvidenceParity.test.ts`

Likely touched files:

- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/core/shell/sessionEventSurface.ts`
- `packages/ts-shell/src/core/shell/sessionFutureTurnProjection.ts`
- `packages/ts-shell/src/core/shell/sessionPersistenceProjection.ts`
- `packages/ts-shell/src/session/stoppedSessionContinuity.ts`
- `packages/ts-shell/src/session/sessionResumeContextBuilder.ts`
- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
- `packages/ts-shell/src/core/query/terminalClassificationProjection.ts`
- `packages/ts-shell/src/core/query/capabilityResultClassification.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/orchestration/agentPlanResult.ts`
- `packages/ts-shell/src/orchestration/contextPacketResult.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-real-user-capabilities` modules only if adding parity markers there

Touch `runMvpIntegratedFlow.ts` only if a test proves it is required for evidence handoff. Do not add new planning logic there.

## Implementation tasks

### 1. Audit current parity behavior

Before changing behavior, determine:

- which terminal details come from Result Surface today
- which details are re-derived in session terminal state
- how compact summaries are built
- how `/continue` seeds are extracted
- where approval-denied compact Reason drift occurs
- how Route 181 context packet evidence appears in terminal / compact / continue
- how Route 182 agent plan evidence appears in terminal / compact / continue
- how edit proposal / repair / hunk-set evidence appears in terminal / compact / continue

Summarize this audit in the final report.

### 2. Define session result parity projection

Add `sessionResultParity.ts` if useful.

Projection should normalize safe terminal details for session consumers:

- terminal classification
- blocker kind
- safe reason
- do-next text
- capability area
- evidence ids / markers
- no-write / mutation state when present
- verification summary when present
- suggested reads when present
- redaction status

This projection must consume Result Surface-owned vocabulary where possible.

It must not decide terminal truthfulness independently.

### 3. Fix approval-denied compact parity

Repair the known regression:

- approval-denied compact output should include expected Reason / do-next detail
- terminal output and compact summary should agree
- `/continue` should explain approval denial without inventing state

Do not change approval policy.

### 4. Context and plan parity

Ensure Route 181/182 facts survive session surfaces:

- context packet id
- context target
- included / omitted source summaries
- suggested reads
- agent plan id
- confidence
- readiness
- missing facts
- no-write / mutationAuthority:not-granted

Terminal, compact, and continue should all agree at summary level.

No raw file excerpts in compact or continue unless already safe by existing read-window rules.

### 5. Edit proposal / repair parity regression

Add parity coverage for recent edit surfaces:

- generated proposal review-required
- provider proposal review-required
- proposal hunk-set preflight stopped
- verification repair proposal created
- repair review-required
- target-set partial failure with recovery available
- explicit rollback applied / stopped

This route should not change edit execution. It only verifies and normalizes session/result projection.

### 6. Shared continuation evidence parity

Add `continuationEvidenceParity.ts` if useful.

It should help tests assert:

- evidence marker exists
- reason exists for stopped state
- do-next exists when actionable
- raw content excluded
- capability area preserved
- future-turn prompt can explain prior state

Do not change session schema.

### 7. Verifier coverage

Strengthen an existing verifier or add a focused parity verifier if clean.

Required coverage:

- approval-denied compact reason
- context packet stopped / continue summary
- agent plan needs-more-context / suggested reads
- edit proposal review-required no-write
- repair proposal review-required no-write
- target-set partial failure recovery summary
- raw content excluded from terminal / compact / continue
- result-contract compatibility

Prefer extending existing context-planning or result-contract adjacent gates rather than creating a broad framework.

### 8. Coupling guard

Add a lightweight guard through tests or module boundaries:

- session terminal should not duplicate a new blocker vocabulary when Result Surface already owns it
- compact / continue tests should use shared projection helpers where possible
- new session details should flow through parity projection rather than ad hoc parsing

No brittle line-count or architecture police.

### 9. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades are added
- foundation risk register if session/result parity risk changes
- module backlog if route status is tracked

No large architecture doc.

## Boundaries

Hard boundaries:

- no new product capability
- no edit execution expansion
- no provider/model calls
- no browser work
- no approval policy change
- no session schema change
- no compact retention semantic change
- no hidden chain-of-thought persistence
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor
- no Result Surface bypass
- no raw file/provider/browser content in compact or continue

## Validation

Run focused validation based on touched files:

- session terminal state tests
- session runtime boundary tests
- session resume context tests
- stopped session continuity tests
- result mapper / result surface tests if touched
- context packet / agent plan regression tests
- edit proposal / repair parity regression tests
- parity verifier if added
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Run edit closeout only if edit execution or edit verifier files are touched.

## Final report

Include:

1. What changed
2. Current parity audit
3. Approval-denied compact fix
4. Context / agent-plan parity behavior
5. Edit proposal / repair parity behavior
6. Session / Continue behavior
7. Verifier coverage
8. Coupling reduction
9. Validation
10. Remaining risks
11. Next route recommendation
