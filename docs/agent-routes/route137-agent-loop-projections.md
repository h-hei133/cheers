# Route 137: Agent loop projection extraction

## Goal

Extract pure projection seams from `runMvpIntegratedFlow.ts` and adjacent result/session surfaces without changing behavior.

Route 136 built the control-plane atlas and proved one safe SessionManager projection extraction.
Route 137 should now apply the same pattern to the largest control-plane file: `runMvpIntegratedFlow.ts`.

This route is aggressive in extraction scope but conservative in semantics.

It owns:

- agent-loop projection candidates from Route 136
- stopped/result projection helpers
- capability evidence projection helpers
- transcript/continue summary projection helpers
- browser/edit/tool outcome projection helpers where safe
- focused characterization tests before/after extraction
- updated architecture note showing reduced coupling

This is not a main-loop rewrite.

## Expected outcome

By the end of Route 137:

1. `runMvpIntegratedFlow.ts` has less inline result/evidence/summary construction.
2. At least two projection/helper families are extracted if safely possible.
3. Extracted helpers are pure or near-pure and covered by focused tests.
4. Result contract behavior is unchanged.
5. Transcript and `/continue` behavior is unchanged.
6. Browser/edit/tool capability behavior is unchanged.
7. Future routes have clearer seams for real control-flow decomposition.

## Required inputs

Read before editing:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/run-mvp-ledger.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/session-manager-boundary.md`
- `docs/architecture/module-backlog.md`
- `docs/architecture/capability-contract.md`

Use these as constraints.

## Reference scan

Use references only for projection/result/evidence boundaries.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/gemini-cli`

Budget:

- ClaudeCode: max 6 files
- opencode: max 8 files
- OpenHands: max 6 files
- Inspect AI + mini-swe-agent + gemini-cli: max 8 files total

Focus:

- result projection
- tool observation summaries
- transcript event summaries
- stopped/error result construction
- evidence shaping
- terminal output projectors
- event/log/report separation

Do not study browser runtime internals unless a projection touches browser transaction evidence.

## Files

Likely new files:

- `packages/ts-shell/src/orchestration/flowResultProjection.ts`
- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`
- `packages/ts-shell/src/orchestration/flowTranscriptProjection.ts`
- `packages/ts-shell/src/orchestration/flowProjection.test.ts`
- `docs/architecture/agent-loop-projection-extraction.md`

Likely touched files:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- result mapper files if a projection is already duplicated there
- session/continue evidence files if needed
- browser/edit result projection files only if reuse is obvious

Keep names short. Avoid creating many tiny files.

## Implementation tasks

### 1. Characterize current projection blocks

Before extraction, identify repeated or large inline blocks in `runMvpIntegratedFlow.ts` that construct:

- stopped results
- actionable blocker results
- capability evidence
- browser transaction summaries
- edit/patch result summaries
- transcript continuation evidence
- terminal-facing result text
- verification/fallback summaries

Document the chosen extraction targets in `docs/architecture/agent-loop-projection-extraction.md`.

### 2. Extract result projection

Add `flowResultProjection.ts` or equivalent.

Prefer extracting pure helpers for:

- stopped result shape
- policy-blocked result shape
- unavailable capability result shape
- timeout/failure result shape
- success result summary shape where safe

Rules:

- no behavior change
- no new result taxonomy unless already present
- no loss of fields
- no hidden fallback behavior drift

### 3. Extract evidence projection

Add `flowEvidenceProjection.ts` or equivalent.

Prefer extracting pure helpers for:

- capability evidence ids
- browser/edit/tool evidence summaries
- cleanup/redaction evidence
- reason-code projection
- compact evidence for result mapper/session handoff

Rules:

- no raw DOM/secrets
- no schema change unless internal-only and fully covered
- preserve existing evidence markers exactly where externally asserted

### 4. Extract transcript projection

Add `flowTranscriptProjection.ts` or equivalent.

Prefer extracting pure helpers for:

- continuation evidence summary
- browser transaction transcript summary
- edit/patch transcript summary
- stopped-result transcript summary
- replay-safe compact observation

Rules:

- no persistence schema change
- no raw content expansion
- `/continue` behavior must remain stable

### 5. Update call sites

Replace inline construction in `runMvpIntegratedFlow.ts` with the new helpers.

Allowed:

- mechanical replacement
- local type cleanup
- removing duplicated inline object construction

Not allowed:

- control-flow rewrite
- provider/model flow changes
- browser/edit feature changes
- permission semantics changes

### 6. Tests

Add focused tests for extracted helpers.

Required coverage:

- success projection preserves fields
- stopped projection preserves blocker/reason/do-next
- unavailable projection preserves setup hint
- policy-blocked projection stays actionable
- browser transaction evidence stays redacted
- edit/patch evidence markers remain stable
- transcript projection is replay-safe
- `/continue` summary has no raw DOM/secrets
- helper output matches pre-existing expected shape

If possible, add one characterization test around the existing integrated flow that proves final output did not change.

### 7. Architecture note

Create `docs/architecture/agent-loop-projection-extraction.md`.

Include:

- extracted families
- before/after ownership
- what remains inside `runMvpIntegratedFlow.ts`
- what is now safe for Route 138
- risks intentionally not touched

### 8. Backlog update

Update `docs/architecture/module-backlog.md`.

Route 138 should be more implementation-oriented, for example:

- Session codec / continue seam extraction
- Tool-policy-result contract unification
- Agent loop dispatch seam extraction

Do not revert to many docs-only routes.

## Boundaries

Hard boundaries:

- no product behavior changes
- no provider/model live calls
- no browser feature expansion
- no edit/patch feature expansion
- no permission behavior changes
- no SessionManager schema changes
- no CLI UX changes
- no broad runMvp control-flow refactor
- no package dependency changes
- no commit or push

## Validation

Run:

- focused projection tests
- focused existing tests for touched result/session/orchestration areas
- existing browser agent/transaction tests if browser projection touched
- existing edit closeout tests if edit projection touched
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run broad unrelated suites.

## Final report

Include:

1. What changed
2. Extracted projection families
3. Before/after runMvp responsibility reduction
4. Behavior preservation evidence
5. Transcript and `/continue` stability
6. Redaction guarantees
7. Validation
8. Remaining risks
9. Route 138 recommendation
10. Proposed commit message

Do not commit or push.
