# Single-file Apply Patch ResultMapper / SessionRuntime Bridge Contract

## Goal

Add a contract-only runtime bridge projection for the single-file `*** Update File` apply_patch dry-run route. The bridge takes only the terminal-safe surface and produces a mapper-ready / session-safe shape that cannot be interpreted as write success.

## Boundary

The bridge lives in the `patchResult` layer. It does not modify `resultMapper.ts`, `sessionRuntime.ts`, CLI, SessionManager, runMvpIntegratedFlow, provider/auth, real-provider scripts, release/default gates, or any production writer.

The current production rejection of apply_patch / unified diff shapes remains unchanged.

## Input

The only allowed input is `SingleFileApplyPatchTerminalSurface`. Raw permission metadata, dry-run internals, and stale-read internals must first pass through the terminal-safe projection.

## Output

The bridge exposes:

- `source="single-file-apply-patch-terminal-surface"`
- `status="dry-run-ready" | "blocked" | "permission-pending"`
- `mapperSafe=true`
- `sessionSafe=true`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `wouldChangeFiles` / `previewChangedFiles`
- approval decision limited to `pending | blocked | denied`
- a runtime-safe `codingResultProjection`
- a `terminalSafetyProof` proving no mutation success, no write success, no applied patch record, no approved decision, no changed files, and preview files isolated to preview fields
- actionable `nextAction` / `doNext`

## Projection Semantics

- `dry-run-ready` stays no-write and no-success; verification is not passed.
- `permission-pending` is runtime-blocked until explicit permission and stale-read revalidation occur.
- stale-read and target-missing blocked states preserve blocker kind, reason, and next action.
- `wouldChangeFiles` and `previewChangedFiles` never enter `changedFiles`.
- patch records are never `applied`; blocked cases use failed records only.
- task satisfaction is never `satisfied`.

## Open-source Boundary Absorption

This route absorbs only Claude Code / Opencode's boundary separation: internal metadata, permission prompts, user-visible result, blocked state, and actual write success are distinct layers. It does not absorb a full edit engine, apply_patch engine, multi-file/add/delete/move support, rollback, fuzzy/AST patching, or CLI/session/provider architecture.

## Acceptance

Focused tests must prove:

- dry-run-ready, blocked, and permission-pending surfaces bridge successfully.
- mapper/session safety markers are true.
- no write intent, changed files, approved decision, applied patch record, mutation success, or write success appears.
- blocked and permission-pending projections never use `verification.status=passed` or `taskSatisfaction.verdict=satisfied`.
- stale-read and target-missing blockers retain actionable next actions.
- terminal-safe surface, permission metadata binding, and production rejection tests remain green.

## Follow-up Gate

Production write remains blocked after this bridge. A future route may evaluate resultMapper/sessionRuntime contract tests against the bridge output, but direct runtime wiring and production writes require separate approval, explicit permission UX, final stale-read revalidation, and writer-boundary proof.
