# Agent Loop Projection Extraction

Route: `docs/agent-routes/route137-agent-loop-projections.md`

## Scope

Route 137 extracted projection-only seams from
`packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` without changing
control flow, provider/model behavior, browser capability behavior, edit/write
behavior, permission decisions, CLI UX, dependencies, or session schema.

The extraction follows the Route 136 atlas constraint: move only pure
result/evidence/transcript shaping out of the main loop while keeping execution
and policy decisions in their existing owners.

## Reference Constraints

Bounded reference scan used these projection patterns only:

- ClaudeCode tool orchestration separates tool execution updates from
  user-facing tool UI summaries.
- opencode separates session processor state, tool result metadata, and
  permission ask/reply contracts.
- OpenHands treats conversation events as a storage/retrieval/streaming product.
- Inspect AI models transcript events as a typed event union.
- mini-swe-agent stores trajectory messages separately from the loop that calls
  model/query/execute.
- gemini-cli keeps CLI bootstrapping and event/config surfaces separate from
  core runtime execution.

No reference code was copied.

## Extracted Families

### Browser Result and Transcript Projection

New owner:

- `packages/ts-shell/src/orchestration/flowResultProjection.ts`

Extracted helpers:

- `projectBrowserContinuationResult`
- `projectBrowserTransactionResult`
- `projectBrowserObservationResult`

Before:

- `executeBrowserWorkflowTaskPlan` constructed browser continuation output,
  transaction stopped/success coding results, browser observation stopped/success
  coding results, and raw-DOM-excluded user-facing summaries inline.

After:

- `executeBrowserWorkflowTaskPlan` still owns browser control flow and execution
  calls.
- The new helper owns only the already-existing result object and user-facing
  summary shapes.
- Browser continuation summary remains replay-safe: it carries the summary and
  explicitly states raw DOM is excluded.

### Flow Evidence Projection

New owner:

- `packages/ts-shell/src/orchestration/flowEvidenceProjection.ts`

Extracted helpers:

- `buildBrowserAgentBaseEvidence`
- `projectBrowserContinuationEvidence`
- `projectBrowserTransactionEvidence`
- `projectBrowserObservationEvidence`
- `projectBrowserAgentResultEvidence`
- `projectVerificationEvidence`

Before:

- browser loop markers, transaction evidence, observation evidence,
  browser-agent result markers, verification command hints, blocker kind,
  next-action, and resume-eligibility markers were assembled inline.

After:

- execution branches still decide when evidence is emitted.
- helpers only preserve marker strings and ordering for the same inputs.
- verification evidence still takes `verifyLikeCommand` from the existing
  `isVerifyLikeCommand` decision; the helper does not decide command policy.

## What Remains in runMvpIntegratedFlow.ts

`runMvpIntegratedFlow.ts` still owns:

- planner/coder/reviewer runner composition
- prompt classification and workflow task planning
- browser transaction execution call
- browser tool dispatch loop
- edit/patch mutation execution
- bash/verify dispatch and approval path
- provider/model streaming
- target resolution and continuation decisions
- final mutation outcome assembly

This route intentionally did not extract the turn kernel, capability dispatch
table, provider diagnostic planning, mutation target selection, or read-window
continuation logic.

## Behavior Preservation

Focused projection tests cover:

- browser continuation summaries stay replay-safe and raw-DOM-excluded
- browser transaction stopped result preserves failed file, blocked
  verification, reason, next action, and redacted evidence markers
- browser observation success preserves user-facing output and evidence markers
- browser observation policy block remains actionable and stopped
- verification evidence preserves command, cwd, target, blocker, next-action,
  and resume-eligible markers

Existing focused browser agent loop tests also pass after the extraction.

`runMvpIntegratedFlow.test.ts` has a pre-existing baseline failure unrelated to
this diff: the single test `covers prompt -> handoff -> tool approval ->
streamed result` fails the same way with Route 137 changes temporarily stashed.
That failure is recorded as pre-existing and should not be fixed inside this
projection route.

## Redaction and Continue Boundaries

Preserved:

- browser summaries continue to include `Raw DOM: excluded`
- browser evidence keeps `browser-agent-loop:no-raw-dom`
- browser observation evidence keeps `browser-observation:raw-dom-excluded` and
  `browser-observation:no-secrets`
- browser transaction evidence keeps existing transaction redaction markers
- verification evidence continues to emit only command/cwd/target/blocker
  metadata needed for `/continue`

Not touched:

- `SessionManager.ts` schema
- transcript JSONL format
- compact/replay builders
- browser runtime internals
- edit/patch write authority

## Route 138 Recommendation

Route 138 should continue with implementation, not docs-only cleanup:

1. extract one SessionManager recovery/reentry projector or codec with focused
   tests; or
2. extract one agent-loop dispatch seam now that browser result/evidence
   projection is separated; or
3. unify tool-policy-result contract markers where the helper can remain pure.

Stop if the next change requires session schema changes, provider auth movement,
browser/edit capability expansion, or CLI behavior changes.
