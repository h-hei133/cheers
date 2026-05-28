# SessionManager Audit

Status: COMPLETE for this audit route. Runtime code, source files, tests,
package scripts, live-provider behavior, and session schema were not changed.

This audit covers `packages/ts-shell/src/session/SessionManager.ts` as the
next Phase 3 concentration point after the runMvp, workflow execution
coordinator, and workflow task plan audits.

Final verdict: `SessionManager.ts` is a legitimate session facade and
coordinator, but it is also a partial session monolith. It validly coordinates
session identity, lifecycle, persistence, transcript reads/appends, current
session selection, metadata, and compatibility with existing session records.
It also still deeply owns recovery eligibility, replay/read-model assembly,
runtime seed construction, long-session continuity projection, approval memory
persistence, working-memory compatibility parsing, and presentation-adjacent
summary projection.

The file should stay as the compatibility facade for existing callers while
implementation routes extract named owners under `session/store`,
`session/transcript`, `session/replay`, `session/continuation`,
`session/recovery`, `session/summary`, `session/approval`,
`session/presentation`, and `session/schema`. Do not replace these with vague
helper, utils, support, or manager helper modules.

Artifacts:

- `00-current-map.md`: current file map, imports, exports, public methods,
  storage paths, schema touchpoints, tests, and consumers.
- `01-ownership-audit.md`: classification of every major symbol and high-density
  region.
- `02-stay-vs-move.md`: stay, move, split, and deprecate matrix.
- `03-extraction-targets.md`: concrete extraction targets grouped by future
  implementation route.
- `04-risk-register.md`: schema, transcript, replay, continuation, approval,
  truthfulness, presentation, compatibility, and import-cycle risks.
- `05-validation-plan.md`: future route validation gates.
- `06-next-implementation-routes.md`: recommended grouped implementation
  sequence.

Evidence used:

- `SessionManager.ts`: 2581 lines.
- `SessionManager.test.ts`: 3876 lines, 56 `it(...)` cases covering storage,
  workspace binding, current session selection, recovery eligibility, replay,
  runtime seeds, pending lifecycle repair, approval memory, long-session
  compaction, and continuity projection.
- Serena symbol overview for `SessionManager.ts`.
- Serena references for `SessionManager`, `buildContinuitySnapshot`,
  `buildRuntimeStateSeed`, and `describeSessionReentry`.
- Focused line-range inspection of `SessionManager.ts`.
- Required adjacent modules:
  `sessionRecoverySelection.ts`, `sessionPresentationFacts.ts`,
  `inlineContinuityContext.ts`, `turnContinuationFacts.ts`,
  `continuationTargetRebase.ts`.
- Prior Phase 3 context docs for runMvp, workflow execution coordinator, and
  workflow task plan.

Serena usage:

- Project was activated with Serena.
- Onboarding requested memory setup; it was skipped because this route is
  audit-only and explicitly says to skip memory writes when onboarding asks for
  them.
- Serena was used for symbol overview and references. It was not used as a
  validation replacement.

Implementation recommendation:

It is safe to start implementation with a compatibility-preserving store,
schema, and transcript extraction. Do not start by extracting continuity,
recovery, presentation, approval memory, or replay truth behavior in the same
route as schema/storage moves.
