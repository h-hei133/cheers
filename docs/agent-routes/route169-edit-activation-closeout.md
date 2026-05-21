# Route 169: Edit activation closeout gate

## Goal

Close out the activated exact fenced replacement lane as a stable, user-reachable Edit / Patch capability.

Route 167 implemented the owner lane.
Route 168 activated it through prompt / CLI / agent-loop selection.

Route 169 should harden the vertical path before any broader edit expansion:

- success / stopped / failed taxonomy
- terminal wording
- Result Surface classification
- Session / Continue parity
- verifier marker/report coverage
- dry-run and no-write evidence
- regression gate for activated exact fenced replacement

This route should not add new edit power.

## Expected outcome

By the end of Route 169:

1. Activated exact fenced replacement has a stable taxonomy across Edit / Patch, Result Surface, Session / Continue, and verifier reports.
2. Success, stopped, and failed outcomes are distinguishable and user-visible.
3. Stopped outcomes are actionable and do not look like write success.
4. Dry-run / unsupported / future-only paths remain no-write.
5. Session / Continue can summarize activated fenced replacement without raw content.
6. Verifier coverage proves prompt/CLI reachability and no-write safety.
7. A focused closeout gate catches future drift in this activated lane.
8. No broader edit capability is enabled.

## Required docs

Read only route-relevant docs first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/resultmapper-module-extraction.md`
- `docs/architecture/verifier-module-extraction.md`
- `docs/foundation/foundation-risk-register.md`

If a listed doc is unavailable or stale, prefer current code and focused tests.

## Reference scan

Use references only for edit result / gate / terminal behavior.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/inspect_ai`

Secondary:

- `/home/wang/projects/mini-swe-agent`

Budget:

- opencode: max 8 files
- ClaudeCode: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- exact edit result summaries
- permission / stopped edit output
- stale-file and no-write reporting
- terminal result projection
- verifier / eval pass-fail-skip markers
- concise trajectory / report fields

Do not copy broad edit, fuzzy replacement, undo, rollback, or patch-engine behavior.

## Owner modules

Primary owner:

- Edit / Patch

Required downstream owners:

- Result Surface
- Session / Continue
- Harness / Eval
- Workspace / File Context
- Permission / Policy

Likely touched files:

- `packages/ts-shell/src/orchestration/fencedEditActivation.ts`
- `packages/ts-shell/src/orchestration/fencedEditPlanner.ts`
- `packages/ts-shell/src/orchestration/fencedEditRoute.ts`
- `packages/ts-shell/src/orchestration/fencedEditResult.ts`
- `packages/ts-shell/src/orchestration/editPatchModule.ts`
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
- `packages/ts-shell/src/core/query/capabilityResultClassification.ts`
- `packages/ts-shell/src/core/query/terminalClassificationProjection.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/session/sessionContinuityModule.ts`
- `scripts/verify-edit-capability-closeout.mjs`
- `scripts/verify/*` only if verifier module boundaries require it

Do not make `runMvpIntegratedFlow.ts` parse fenced edit internals.

## Implementation tasks

### 1. Outcome taxonomy

Define a compact taxonomy for the activated fenced replacement lane.

Required outcome kinds:

- `fenced-edit-success`
- `fenced-edit-missing-target`
- `fenced-edit-missing-mapping`
- `fenced-edit-multiple-matches`
- `fenced-edit-no-match`
- `fenced-edit-stale-read`
- `fenced-edit-unsupported-fuzzy`
- `fenced-edit-unsupported-discovery`
- `fenced-edit-unsupported-generated`
- `fenced-edit-unsupported-multi-file`
- `fenced-edit-verification-failed`
- `fenced-edit-writer-failed`

Map each to:

- terminal classification
- result status
- actionable blocker kind when stopped
- safe reason
- do-next text
- mutation ran / did not run
- continuation evidence allowed / not allowed
- verifier marker

### 2. Result Surface closeout

Ensure Result Surface owns terminal truthfulness.

Success should show:

- changed file
- operation kind
- verification summary
- safe evidence id or marker

Stopped should show:

- why mutation did not run
- what exact user input is missing or unsupported
- do-next text
- no-write evidence

Failed should be reserved for actual execution / writer / verification hard failures.

No dry-run, unsupported future edit, missing mapping, missing target, or policy stop may appear as success.

### 3. Session / Continue parity

Ensure activated fenced replacement evidence is replay-safe.

`/continue` should summarize:

- successful exact fenced replacement
- stopped missing target
- stopped missing mapping
- stopped no match / multiple matches
- stopped stale-read
- unsupported fuzzy / discovery / generated / multi-file request

Do not persist:

- raw old block
- raw new block
- full file content
- secrets
- provider paths

### 4. Verifier markers and report fields

Strengthen `verify:edit-capability-closeout` for the activated lane.

Required markers or report facts:

- activated success reachable through prompt/CLI path
- mutation ran for success
- mutation did not run for stopped unsupported path
- missing mapping stopped
- multiple matches stopped
- stale-read stopped
- continuation-safe evidence present
- raw content excluded
- result-contract compatible

Keep existing verifier flags, dry-run behavior, dirty-repo guard, and report compatibility stable.

### 5. CLI / terminal wording

Harden user-facing wording for activated fenced replacement.

Required terminal wording qualities:

- clearly says whether a file changed
- clearly says when no write occurred
- includes actionable next step for stopped results
- does not dump raw fenced content
- does not overclaim verification
- distinguishes unsupported future edit from execution failure

Do not redesign CLI.

### 6. No-write and dry-run safety

Add or harden tests proving no mutation occurs for:

- fuzzy request
- discovery request
- generated-content request
- multi-file request
- missing mapping
- multiple matches
- stale-read failure
- dry-run / planning-only path if applicable

### 7. Focused closeout gate

If clean, add or strengthen a focused gate inside the existing edit closeout verifier.

The gate should fail if:

- activated lane is no longer reachable
- stopped unsupported edit mutates files
- success lacks verification summary
- stopped result lacks do-next
- terminal classification drifts
- continuation evidence includes raw content
- verifier report hides skipped/stopped facts

Do not create a new broad test runner.

### 8. Docs update

Update only long-lived docs directly affected:

- implementation manifest if outcome markers / validation gates change
- capability recipes if edit closeout guidance changes
- future edit contract if activated lane status needs clarification
- foundation risk register if Harness gate taxonomy risk is reduced or narrowed
- module backlog if route status is tracked

No new large architecture doc.

## Boundaries

Hard boundaries:

- no new edit behavior beyond activated exact fenced replacement
- no broad/fuzzy replacement execution
- no discovery edit execution
- no multi-file edit execution
- no generated-content edit
- no rollback/snapshot execution
- no provider/model calls
- no browser work
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- fenced edit planner/activation/route/result tests
- Result Surface tests if touched
- Session / Continue tests if touched
- CLI/print path tests if touched
- verifier closeout tests
- no-write regression tests
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- `rtk git diff --check`
- `rtk git status --short --branch`

If package files change unexpectedly, stop and report.

## Final report

Include:

1. What changed
2. Activated fenced edit outcome taxonomy
3. Result Surface behavior
4. Session / Continue behavior
5. Verifier / gate coverage
6. CLI / terminal wording
7. No-write safety evidence
8. Validation
9. Remaining risks
10. Next route recommendation
