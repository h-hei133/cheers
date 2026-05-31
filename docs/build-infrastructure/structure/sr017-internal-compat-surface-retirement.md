# SR017: Internal Compatibility Surface Retirement

## Goal

Continue source tree cleanup after SR016.

This is structure work only. It must not implement product behavior.

Focus on internally imported compatibility surfaces. Replace internal imports with owner paths, then remove export-only files only when safe.

Expected final status: COMPLETE.

## Main objective

Reduce visual noise caused by old export-only files that are still imported internally.

Improve at least three measurements, and at least one must be:

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
- export-only compatibility files
- the 33 internally imported compatibility files
- root orchestration files
- owner folders for edit, result, evidence, verification, repair, session, core, runtime, planning, context, provider, tools
- package exports or documented public entry points if present
- imports to old paths
- tests outside owner folders
- direct file counts and long filenames

Use targeted search for imports.

Do not inspect outside codebases.

## Measurements

Before and after editing, record:

- root orchestration direct file count
- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- tests outside owner folders
- long basename count in target areas
- top crowded directories by direct file count

Update docs/build-infrastructure/structure-tree-pressure-report.md.

## Allowed work

1. Replace internal imports from old compatibility paths with true owner paths.
2. Remove export-only compatibility files only when no internal imports remain and no package-facing need is documented.
3. Keep compatibility files when package-facing safety is unclear, and document the deletion condition.
4. Move small owner files or tests only when ownership is clear and it helps remove old imports.
5. Add a compatibility table to the pressure report with path, kept or removed, internal import count, reason, and deletion condition.

## Forbidden work

Do not implement features or change behavior.

Do not change result truthfulness, provider config/auth, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write authority/approval behavior, verification/repair execution, session schema, CLI behavior, workflow coordinator, SessionManager, package scripts, build config, dependencies, or workspace packages.

Do not create dumping folders with generic names.

## Naming

Use short local names for any moved product files.

New product paths, product content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Validation

Run:

- focused tests for touched domains
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, evidence, terminal, or output-facing code is touched
- git diff --check
- git status --short --branch
- git status after commit
- git status after push attempt

Do not claim validation passed unless actually run.

## Stop conditions

Stop and report PARTIAL if:

- package-facing compatibility safety is unclear for enough files to prevent improvement
- import churn becomes too large
- circular imports appear
- compatibility files need logic
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
- internally imported compatibility count or export-only count improves
- compatibility files are removed or classified
- internal imports are updated away from old paths where safe
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

Include final status, initial status, inspection summary, before and after measurements, files removed, files moved, tests moved, compatibility kept with reasons, imports updated, validation result, commit hash and message, push status, behavior preservation notes, remaining debt, and next step.
