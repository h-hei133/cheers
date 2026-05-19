# Edit / Patch Module

Route: `docs/agent-routes/route148-edit-patch-module.md`

## Scope

Route 148 switches Edit / Patch work from feature-first slices to a module-owned
boundary. The module now owns the contract surface for mutation classification,
manifest, preview/evidence, preconditions, and result projection while existing
bounded write/edit execution remains unchanged.

New module files:

- `packages/ts-shell/src/orchestration/editPatchModule.ts`
- `packages/ts-shell/src/orchestration/editPatchManifest.ts`
- `packages/ts-shell/src/orchestration/editPatchPreview.ts`
- `packages/ts-shell/src/orchestration/editPatchPreconditions.ts`
- `packages/ts-shell/src/orchestration/editPatchResult.ts`

These helpers are planning/projection helpers. They do not read files, write
files, approve permissions, call providers, call browser runtimes, execute
patches, discover workspace files, or weaken workspace authority.

## Current Supported Lanes

Current supported behavior remains owned by existing bounded routes:

- bounded write: one explicit in-workspace target plus concrete content
- bounded edit: one explicit in-workspace target plus concrete replacement,
  patch, or current supported fenced target content
- no-write inspect/read paths remain separate from mutation
- workspace authority, final stale-read, approval, and post-write verification
  remain execution-route checks, not manifest authorization

The module represents these as `current-route-delegated`; it does not replace
the writer or claim write success.

## Current Unsupported Modes

These remain unsupported as execution paths:

- broad refactor execution
- batch or broad multi-file write execution
- multi-file discovery edit execution
- fuzzy or broad fenced replacement execution
- generated content from vague prompts
- rollback/snapshot execution

The module represents them as preview-only or stopped states with Route 146
tool/policy/result vocabulary.

## Module Responsibilities

| Responsibility | Owner |
|---|---|
| current edit/write expectation classification | `editExpectationContract.ts` |
| future edit expansion classification | `futureEditContract.ts` |
| module facade | `editPatchModule.ts` |
| mutation manifest | `editPatchManifest.ts` |
| preview/evidence substrate | `editPatchPreview.ts` |
| precondition projection | `editPatchPreconditions.ts` |
| result/transcript/continue projection | `editPatchResult.ts` |
| bounded writer authority and execution | existing `patchResult/*` routes |

## Cross-Module Inputs

The module accepts prompt-derived facts only:

- prompt and target hints
- concrete content or exact replacement facts
- edit/write/read intent facts
- candidate target hints when a future discovery route has produced them
- precondition facts such as target confirmation, workspace authority,
  stale-read, verification plan, rollback/snapshot, and user confirmation

It does not perform discovery or filesystem reads itself.

## Cross-Module Outputs

The module outputs:

- `EditPatchMutationManifest`
- `EditPatchPreviewEvidence`
- `EditPatchPreconditionProjection`
- `EditPatchResultProjection`

These outputs are replay-safe and do not contain raw file dumps. They are safe
for transcript and `/continue` summary surfaces.

## Mutation Manifest

The manifest records:

- requested mode
- support status
- explicit targets and candidate targets
- per-file planned operation kind
- content or transform summary
- workspace authority requirement
- final stale-read requirement
- verification requirement
- rollback/snapshot requirement
- confirmation requirement
- redaction marker
- `authorization: not-authorization`

The manifest is never write authorization. Current bounded lanes are marked as
`current-route-only`; future modes have `writeIntent: none`.

## Preview And Evidence

Preview records:

- evidence id
- target summary
- operation summary
- planned change summaries
- missing information
- ambiguity facts
- authority facts
- stale-read facts
- verification plan
- rollback/snapshot requirement
- raw content exclusion marker

Preview text redacts secret-like values, private real-provider paths, and raw
browser/page content markers before projection.

## Preconditions

The module represents these preconditions:

- explicit target
- content, exact mapping, or transform manifest
- candidate target confirmation
- workspace authority
- final stale-read
- verification plan
- rollback/snapshot
- user confirmation

Current bounded lanes delegate workspace authority, stale-read, and verification
to existing routes. Future modes remain blocked as preview-only until a later
route supplies concrete precondition facts and an execution route.

## Result Projection

Module result projection uses Route 146 vocabulary:

- current bounded lanes project as `completed` only to indicate delegation to
  the existing current route
- future modes project as `stopped`, policy blocked, execution not-run
- unsupported or vague mutation requests project as stopped/actionable
- evidence includes `mutation:not-run-in-module`
- transcript and continue summaries use replay-safe `toolResultProjection`

## Future Mode Alignment

| Future mode | Module representation | Execution status |
|---|---|---|
| broad refactor | preview-only manifest with target/constraint and rollback requirements | not enabled |
| multi-file discovery edit | candidate target preview requiring user confirmation | not enabled |
| fenced replacement | exact target/mapping precondition state | broad/fuzzy execution not enabled |
| rollback/snapshot | precondition requirement | implementation not enabled |

## Reference Scan

The reference scan was shape-only; no implementation code was copied.

- opencode keeps edit/write schemas, diff preview, permission ask, and write
  execution as separable tool responsibilities.
- Claude Code file tools keep permission, stale-file checks, and result UI close
  to the file tool boundary.
- Gemini CLI exposes tool invocation locations, confirmation details, policy
  update options, and modifiable edit confirmation before execution.
- Inspect AI's text editor separates create/replace/insert/undo commands,
  reinforcing that rollback is a distinct capability with its own history.

## Future Implementation Sequence

1. Route 149: decide whether to continue inside Edit / Patch by adopting this
   module facade in one thin runMvp classification/projection point, or move to
   Runtime Receipt Contract if runtime/tool result coherence is more urgent.
2. Fenced replacement bounded route: exact target and exact mapping only.
3. Discovery edit target selection: candidate list plus user-confirmed target
   set, still no broad write by default.
4. Broad refactor manifest: target/constraint manifest with no mutation.
5. Snapshot/rollback precondition: requirement and evidence before any broad
   execution route.

## Preserved Boundaries

Route 148 did not enable provider/model calls, browser work, broad
edit/refactor/batch/discovery/fuzzy execution, vague generated content,
workspace authority weakening, stale-read bypass, approval bypass,
rollback/snapshot implementation, SessionManager schema changes, CLI redesign,
dependency changes, or broad `runMvpIntegratedFlow.ts` rewrites.
