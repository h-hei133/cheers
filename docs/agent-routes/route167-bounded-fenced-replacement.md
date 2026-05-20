# Route 167: Bounded fenced replacement

## Goal

Implement a narrow, exact-mapping fenced replacement lane through the current Edit / Patch module facades.

This route is the first post-module-governance capability route. It should prove that new product behavior can land through owner modules and capability lifecycle boundaries without pushing details back into `runMvpIntegratedFlow.ts`, `cli.tsx`, `SessionManager.ts`, `sessionRuntime.ts`, or `resultMapper.ts`.

The capability is intentionally narrow:

- one explicit in-workspace target file
- one exact fenced block or exact old/new fenced mapping
- exactly one matched replacement region
- existing workspace authority
- final stale-read revalidation
- post-write verification projection
- Result Surface stopped/success truthfulness
- transcript/continue-safe mutation evidence
- focused verifier coverage

This is not broad edit, discovery edit, fuzzy replacement, generated-content edit, rollback, or multi-file refactor.

## Why now

Recent routes established:

- active documentation entrypoints
- implementation-context capability flows
- owner module facades
- workspace/file context projection seams
- Result Surface blocker vocabulary
- Session / Continue safe evidence paths
- Harness / Eval verifier module boundaries

Route 167 should use those boundaries for real capability work.

## Required docs

Read only these route-relevant docs before implementation:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/architecture/future-edit-expansion-contract.md`
- `docs/foundation/foundation-risk-register.md`

Do not read old route docs, browser docs, provider docs, or historical extraction docs unless code/tests expose a direct need.

## Reference scan

Use references only for exact edit semantics and permission/result shape.

Primary:

- `/home/wang/projects/opencode`
- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`

Budget:

- opencode: max 8 files
- ClaudeCode: max 8 files
- gemini-cli: max 6 files
- Inspect AI: max 4 files

Focus:

- exact old/new replacement
- permission/approval metadata for file edits
- stale file protection
- edit result summaries
- undo/rollback as future boundary, not current behavior

Do not copy broad patch engines or fuzzy edit recovery.

## Owner modules

Start in Edit / Patch.

Use or strengthen these facades:

- `packages/ts-shell/src/orchestration/editPatchModule.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.ts`
- `packages/ts-shell/src/orchestration/workspaceFileContract.ts`
- `packages/ts-shell/src/orchestration/workspaceTargetProjection.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts`
- `packages/ts-shell/src/orchestration/patchResult/mutationVerificationProjection.ts`

Downstream modules:

- Result Surface for success/stopped/error truthfulness
- Session / Continue for safe mutation evidence
- Harness / Eval for focused gate coverage

## Implementation tasks

### 1. Audit current fenced behavior

First determine what the current bounded edit route already supports.

Classify existing behavior into:

- already supported exact fenced replacement
- supported but not first-class / not well tested
- stopped future-only fenced replacement
- unsupported fuzzy/broad replacement

Do not duplicate an existing lane. If exact fenced replacement already exists, harden and expose it through the owner module facade instead of reimplementing it.

### 2. Define fenced replacement contract

Add or update a focused contract/helper under Edit / Patch.

Preferred short names if new files are needed:

- `fencedEditContract.ts`
- `fencedEditPlanner.ts`
- `fencedEditResult.ts`

Contract requirements:

- explicit target file
- exact old/new mapping or exact fenced region mapping
- exactly one replacement region
- no fuzzy search
- no file discovery
- no generated-content inference
- no multi-file target set
- no rollback/snapshot behavior
- no provider/model call
- no browser involvement

Stopped cases must include safe reason and do-next text.

### 3. Planning and classification

Teach the Edit / Patch facade to recognize exact fenced replacement requests.

Supported examples:

- replace the exact fenced block in `path`
- replace content between explicit fence markers in `path`
- replace this exact old fenced block with this exact new fenced block in `path`

Unsupported / stopped examples:

- replace similar block
- find the right file and replace the block
- update all fenced blocks
- rewrite generated content without exact mapping
- broad refactor inside fenced regions
- ambiguous target
- missing target
- missing new content
- multiple matching fenced regions

Low-confidence planning must stop before mutation.

### 4. Execution lane

Wire exact fenced replacement into the existing bounded mutation path.

Required execution preconditions:

- workspace authority passes
- target is explicit and in workspace
- final stale-read check runs immediately before mutation
- exact match count is one
- writer uses existing bounded write/edit route
- post-write verification projection runs

Do not create a second writer system.

### 5. Result and evidence

Emit:

- changed file summary
- exact replacement summary
- verification summary
- safe evidence marker
- continuation-safe mutation evidence
- actionable blocker evidence for stopped cases

Do not emit:

- raw full file content
- secret material
- provider config paths
- vague success if replacement did not run
- mutation success when verification/stale-read failed

### 6. Session and continue

Add continuation-safe evidence for fenced replacement.

`/continue` should be able to summarize:

- target file
- operation kind: fenced replacement
- changed/unchanged/stopped state
- blocker reason when stopped
- verification summary
- do-next if actionable

It must not require raw file content.

### 7. Verifier / gate coverage

Add focused gate coverage through the Harness / Eval module if needed.

Prefer adding a targeted verifier case over broad package sweeps.

Required case families:

- exact fenced replacement success
- missing target stopped
- ambiguous target stopped
- missing mapping stopped
- multiple matches stopped
- stale-read stopped
- unsupported fuzzy fenced replacement stopped
- verification summary preserved
- continuation-safe evidence present
- raw content/secrets not emitted

### 8. Docs update

Update long-lived docs only where ownership actually changes.

Likely updates:

- `docs/implementation-context/capability-flow-manifest.json` only if new facade/flow fields are introduced
- `docs/implementation-context/capability-recipes.md` only if recipe changes
- `docs/architecture/future-edit-expansion-contract.md` to mark exact fenced replacement lane as current-supported if implemented
- `docs/foundation/foundation-risk-register.md` only if a new risk is discovered or resolved

Do not create a large new architecture doc unless the implementation requires it.

## Boundaries

Hard boundaries:

- no provider/model calls
- no browser work
- no broad/fuzzy replacement
- no file discovery execution
- no multi-file edit execution
- no generated-content edit from vague prompt
- no rollback/snapshot execution
- no workspace authority weakening
- no stale-read bypass
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor
- no commit or push

## Validation

Run focused validation based on touched files.

Minimum:

- focused fenced edit tests
- workspace authority / stale-read regression tests
- focused result mapping tests if result surface changes
- focused continuation/session tests if continuation evidence changes
- focused verifier case if added
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If package files changed unexpectedly, stop and report.

Do not run broad unrelated test suites.

## Final report

Include:

1. What changed
2. Existing fenced behavior audit result
3. Exact fenced replacement contract
4. Execution preconditions
5. Stopped cases
6. Result / evidence / continue behavior
7. Verifier coverage
8. Validation
9. Remaining risks
10. Next route recommendation
11. Proposed commit message

Do not commit or push.
