# Context Planning Entry Trim

## Goal

Continue source tree cleanup after owner index cleanup.

This is structure work only. It must not implement product behavior.

Focus on the final internally imported old entry surfaces:

- orchestration/contextEngine.ts
- orchestration/planningRuntimeProductProjection.ts

Expected final status: COMPLETE.

## Main objective

Remove internal use of the remaining old context and planning entry surfaces.

At least three visible measurements must improve.

At least one improved measurement must be:

- internally imported compatibility file count
- export-only compatibility file count
- root orchestration direct file count

## Initial status

Before editing, run git status.

If branch is ahead, attempt one push before editing. If that push fails, do not retry.

Continue only if worktree is clean.

## Inspection

Use Serena targeted inspection before editing.

Inspect:

- latest structure pressure report
- orchestration/contextEngine.ts
- orchestration/planningRuntimeProductProjection.ts
- context/acquisition owner files
- planning/runtime owner files
- imports to the two old paths
- package exports or documented public entry points if present
- tests around context acquisition and planning runtime
- direct file counts and long filenames

Use targeted search for imports.

Do not inspect outside codebases.

## Measurements

Before and after editing, record:

- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- root orchestration direct file count
- context/acquisition direct file count
- planning/runtime direct file count
- tests outside owner folders for touched owners
- long basename count in target areas

Update docs/build-infrastructure/structure-tree-pressure-report.md.

## Allowed work

1. Replace internal imports from the two old paths with true owner paths.
2. Remove the old export-only files only if no internal imports remain and no package-facing need is documented.
3. Keep old files only if package-facing safety is unclear, and document reason plus deletion condition.
4. Move small owner tests only when ownership is clear and it helps remove old imports.
5. Keep retained old files as one-line exports only.

## Forbidden work

Do not implement features or change behavior.

Do not change output semantics, result truthfulness, provider config or auth, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write authority/approval behavior, verification or repair execution, session schema, CLI behavior, workflow coordinator, SessionManager, package scripts, build config, dependencies, or workspace packages.

Do not create dumping folders with generic names.

## Naming

Use short local names for moved product files.

New product paths, product content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Validation

Run:

- focused context acquisition tests if context files are touched
- focused planning runtime tests if planning files are touched
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, evidence, terminal, or output-facing code is touched
- git diff --check
- git status --short --branch
- git status after commit
- git status after push attempt

Do not claim validation passed unless actually run.

## Stop conditions

Stop and report PARTIAL if:

- package-facing compatibility safety is unclear for both old files
- import churn becomes too large
- circular imports appear
- old files need logic
- tests require behavior changes
- protected behavior would change
- build config or package scripts must change
- no visible measurement can improve safely

## Completion criteria

COMPLETE only if:

- initial status is reported
- targeted inspection was performed
- before and after measurements are recorded
- at least three measurements improve
- internally imported compatibility count, export-only count, or root orchestration direct count improves
- internal imports are updated away from the old paths where safe
- old files are removed or classified
- no product behavior changes
- validation passes
- commit is created after validation
- push is attempted from clean committed state
- if first push attempt fails, do not retry
- pressure report is updated

## Commit and push

Commit after validation passes.

Codex may choose the commit message, but it must avoid user-banned vocabulary.

Push after commit only if status is clean and no unsafe artifact is included.

If first push attempt fails, do not retry.

## Final report

Include final status, initial status and any pre-edit push result, inspection summary, before and after measurements, files removed, files moved, tests moved, old entries kept with reasons, imports updated, validation result, commit hash and message, push status, behavior preservation notes, remaining debt, and next step.
