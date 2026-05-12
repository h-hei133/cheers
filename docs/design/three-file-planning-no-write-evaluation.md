# Three-File Planning No-Write Evaluation

Route: 10
Date: 2026-05-12
Status: evaluation only

This document evaluates whether an exactly three-file planning, no-write surface
should be the next bounded phase after Routes 01-09. It is not a product
readiness claim and does not implement 3-file writes.

## 1. Executive Recommendation

Recommendation: yes, but only as a planning/no-write prerequisite.

The next bounded surface should recognize exactly three existing-file
`Update File` plans, produce a structured stopped result, and preserve no-write
evidence. It should not create a 3-file writer, broaden `apply_patch`, add
delete/move/create semantics, or enter default gates.

This is worth doing because the current system already has:

- deterministic exactly-two update write evidence
- deterministic exactly-two planning/no-write evidence
- deterministic unsupported 3+ file evidence
- result/session surfaces that can report stopped mutation state truthfully

The smallest safe next phase is therefore not "3-file support"; it is an
explicit exactly-three planning classifier that proves the system can explain a
larger task while refusing to write.

## 2. Proposed Bounded Surface

The future bounded surface should mean:

- exactly three operations
- all operations are `Update File`
- every target is an existing selected-workspace file
- paths stay inside the selected workspace
- hunk verification may run for preview/planning only
- output lists planned files or would-change files
- terminal outcome is stopped, not success
- `changedFiles=[]`
- `writeIntents=[]`
- `writerReachable=false`
- `willWrite=false`
- no writer, creator, delete, move, rollback, snapshot restore, or broad patch
  engine is invoked

The future result can say that the request appears to require three file updates
and that 3+ file writes remain unsupported.

## 3. Explicit Non-Goals

Route 10 and the proposed next phase must not implement:

- 3-file writes
- 3+ file mutation support
- delete or move
- broad `apply_patch`
- rollback, snapshot restore, or atomicity
- arbitrary project mutation
- external/user-configured MCP readiness
- default real-provider readiness
- default gate changes

## 4. Capability Boundary

Current supported mutation remains:

- MVP: selected-workspace existing single-file `Update File`
- candidate: single-file `Add File` create
- candidate: exactly-two existing-file `Update File` write
- candidate: exactly-two update planning/preflight no-write smoke

The proposed future capability would add only:

- candidate/backlog-style exactly-three update planning no-write

It would not make a 3-file request completed. It would give the user a safe,
truthful stop point with file names, intended update summaries when available,
and a manual or future-route continuation cue.

## 5. User-Visible Behavior

For a three-file update request, a future route should display:

- outcome: stopped
- reason: 3+ file writes are unsupported
- planned files: the three selected-workspace update targets
- changed files: none
- failed or unsupported files: the three planned targets, or a structured
  planned-files field if one exists
- next action: split into supported smaller operations or wait for a dedicated
  3-file write route

It must not say the task is complete, must not imply rollback, and must not hide
that no write happened.

## 6. No-Write Invariant

The invariant for a future implementation is:

- no writer authority construction when possible
- if routing requires authority, writer callbacks must be unreachable and
  covered by tests that fail on invocation
- `changedFiles` remains empty
- `writeIntents` remains empty
- no applied patch record is created
- terminal classification is stopped/error, not success
- post-run workspace snapshot equals pre-run workspace snapshot
- unsupported write requests still stop before success-like wording

## 7. Failure Classification

Recommended future classes:

- `three-file-planning-no-write`: exactly three existing-file updates verified
  for planning, then stopped because writing is unsupported
- `too-many-files`: more than three update files
- `mixed-operations-not-enabled`: add/delete/move/mixed operations
- `workspace-boundary`: any target outside selected workspace
- `missing-target`: target file missing
- `verification-failed`: hunk/context mismatch
- `model-output`: malformed patch or non-parseable output
- `route`: route rejected before planning
- `post-write`: should be unreachable for this no-write route and should fail
  the verifier if observed

## 8. Evidence From Existing Routes

Evidence supporting this next surface:

- Route 01 proved opt-in real candidate mutation happy paths for bounded
  single-file update, single-file create, and exactly-two update.
- Route 02 failure taxonomy distinguishes config, network/auth, model-output,
  route, post-write, unsupported, product-regression, and unknown.
- Route 03 proves exactly-two selected-workspace update through CLI `--print`
  and confirms 3+ and delete requests remain stopped.
- Route 04 extracted mutation routing projection, so route classification is
  localized.
- Route 05 extracted compact continuity summary, so stopped mutation context can
  survive continuity paths without product behavior changes.
- Route 06 and Route 07 kept MCP/live TTY claims bounded.
- Route 08 proves real-model-like unsupported outputs, including three-file
  update, stop/error with no writes.
- Route 09 clarified that 3+ writes, broad `apply_patch`, rollback, delete/move,
  external MCP, and broad release remain forbidden claims.

Code evidence:

- `multiFileUpdatePlanning.ts` is already a planning/no-write classifier, but
  intentionally caps at exactly two update files.
- `multiFileWriteRoute.ts` requires exactly two update files and returns
  `too-many-files` for 3+.
- `mutationRoutingProjection.test.ts` asserts 3+ update patches stop before
  writer invocation.
- `noWriteRuntimeRoute.ts` defines a strong no-writer/no-success runtime shape.
- `resultMapper.ts`, `mutationVerificationProjection.ts`,
  `sessionStateSurface.ts`, and stopped-session continuity code already carry
  stopped/failed/changedFiles/failedFiles evidence.

## 9. Evidence Against Doing It Now

Reasons to keep the next phase narrow:

- There is no current schema field dedicated to `plannedFiles`; overloading
  `failedFiles` may be confusing unless the future route defines wording
  carefully.
- Existing exactly-two planning text says "multi-file writing is not enabled",
  while exactly-two writing now exists separately; Route 11 should avoid stale
  or ambiguous wording.
- A 3-file planning route could invite broad `apply_patch` creep if it tries to
  parse arbitrary edits, create files, delete files, or summarize model intent
  beyond verified patch operations.
- Real-provider execution is not required to answer the no-write question and
  should remain opt-in.

## 10. Architecture Impact

Expected impact is small if Route 11 stays in projection/planning code:

- extend or add a sibling no-write classifier near `multiFileUpdatePlanning.ts`
- add focused tests for exactly-three planning and unsupported variants
- add a deterministic script case only if existing verification cannot cover
  CLI-visible no-write evidence
- keep write routes unchanged

No provider core, MCP core, CLI entrypoint, session manager, Rust execution, or
default gate membership should change.

## 11. Files Likely To Change In A Future Route

Allowed future files, if Route 11 is approved:

- `packages/ts-shell/src/orchestration/patchResult/multiFileUpdatePlanning.ts`
- `packages/ts-shell/src/orchestration/patchResult/multiFileUpdatePlanning.test.ts`
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`, only for
  minimal no-write projection wiring if necessary
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts`
- `scripts/verify-real-user-capabilities.mjs`, only to add a non-default
  deterministic no-write verification case if focused tests are insufficient
- `RUNBOOK.md`, `PROJECT_STATE.md`, or a manual checklist, only for claim
  wording after evidence exists

## 12. Files That Should Remain Forbidden

Future Route 11 should not touch:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/patchMutationLane.ts`
- `packages/ts-shell/src/orchestration/patchApplication/*`
- provider/auth core
- MCP core
- Rust execution
- mutation lane capability limits
- release/default gate membership

If those files become necessary, the route should stop and be replanned.

## 13. Validation Plan

Route 11 validation should prove:

- exactly-three update planning stops without writes
- 3+ writes remain unsupported
- delete/move/add/mixed patches remain unsupported
- malformed model output is classified as model-output
- changedFiles and writeIntents stay empty
- writer callbacks are not reachable
- default MVP and deterministic release gates remain unchanged
- real-provider gates remain opt-in and default-skip

Suggested focused checks:

- focused unit tests for the three-file no-write classifier
- mutation routing projection test with writer callbacks that throw if invoked
- candidate mutation synthetic suite
- failure taxonomy self-test
- Route 08 unsupported patch E2E
- MVP gate
- result contract
- TS shell build
- deterministic release meta gate

## 14. Manual Checklist Impact

The live TTY checklist already has an unsupported 3+ mutation step. Route 11
should not convert it into a success case. At most, after deterministic evidence
exists, the checklist can mention that a three-file request may show a structured
planning/no-write stop. Manual validation remains non-default.

## 15. Release Claim Impact

Allowed claim after a future successful Route 11:

- "Exactly-three selected-workspace existing-file update requests can be
  classified as planning/no-write and stopped with no changed files."

Forbidden claims:

- "3-file writes are supported"
- "3+ file mutation is ready"
- "broad apply_patch is supported"
- "delete/move/rollback/atomic multi-file recovery is supported"
- "arbitrary project mutation is ready"
- "real-provider/default release readiness improved"
- "external MCP readiness is proven"
- "broad/general release readiness"

## 16. Rollback/Atomicity Impact

No rollback or atomicity should be introduced. A no-write route should explicitly
say rollback is not applicable because no writer ran. If any writer starts, the
route has violated its invariant and should fail validation.

## 17. Real-Provider Impact

No real-provider execution is required. The route can be validated with
synthetic real-model-like outputs. Optional real-provider observation would need
separate explicit approval and must not read or print private provider config.

## 18. MCP Impact

None. This route should not touch MCP routing, external MCP config, MCP servers,
or MCP readiness claims.

## 19. Risks And Anti-Goals

Main risks:

- broad `apply_patch` creep
- confusing planned files with changed files
- accidentally creating a 3-file writer through exactly-two write route reuse
- success-like wording on a stopped route
- default gate expansion
- release claim drift

Anti-goals:

- do not parse arbitrary natural-language plans into write authority
- do not infer approval from prompt text
- do not use real-provider config for this route
- do not turn a planning surface into partial mutation support

## 20. Recommended Next Prompt

Recommended Route 11 prompt summary:

Evaluate and implement a deterministic, non-default exactly-three
selected-workspace `Update File` planning/no-write surface. Keep terminal
outcome stopped, `changedFiles=[]`, `writeIntents=[]`, and writer invocation
impossible. Do not implement 3-file writes, broad `apply_patch`, delete/move,
rollback, default gate changes, provider/auth changes, MCP changes, or broad
release claims. Add focused tests and only minimal documentation updates after
validation passes.

## Reference Comparison

Search terms used:

- Claude Code: `planning`, `edit plan`, `file edit`, `multi file edit`,
  `todo`, `task plan`, `patch`, `unsupported edit`, `read first`,
  `stale edit`, `failed edit`, `changed files`, `failed files`, `no write`,
  `dry run`
- opencode: `plan`, `edit plan`, `multiedit`, `apply_patch`, `patch parse`,
  `patch apply`, `dry run`, `no write`, `snapshot`, `revert`,
  `changed files`, `failed files`, `unsupported`, `permission`

Inspected reference snippets:

- `/home/wang/projects/source-claudecode/tools/EnterPlanModeTool/EnterPlanModeTool.ts`
- `/home/wang/projects/source-claudecode/tools/ExitPlanModeTool/prompt.ts`
- `/home/wang/projects/opencode/README.md`
- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`

Relevant ideas:

- Planning mode can be read-only and explicitly separate from writing.
- A plan review/approval transition is different from write authorization.
- opencode's plan agent denies edits by default, reinforcing that planning can
  be a capability without mutation.
- opencode's apply_patch and snapshot/revert surfaces are much broader than the
  target project's current bounded route and should not be copied into Route 11.

Not applicable:

- broad snapshot/revert machinery
- full edit permission systems
- general-purpose apply_patch implementation
- reference repository UI/runtime architecture

No reference architecture or implementation was copied wholesale.
