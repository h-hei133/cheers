# Compatibility Policy Cleanup

## Goal

Perform a final structured cleanup pass for export-only legacy entry files.

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Classify all export-only legacy entry files and remove the safe batch.

Improve at least three visible measurements.

At least one improved measurement must be:

- export-only compatibility file count
- zero-internal-import compatibility file count
- root orchestration direct file count

## Initial status

Before editing, run git status.

If branch is ahead, attempt one push before editing. If push fails, do not retry.

Continue only if worktree is clean.

## Inspection

Use Serena targeted inspection before editing.

Inspect:

- latest structure pressure report
- all export-only legacy entry files
- package exports and documented public entry points if present
- internal imports to old paths
- script/test/string-only old path mentions
- root orchestration files
- owner folders for context, planning, provider, tools, edit, result, evidence, verification, repair, session, core, runtime
- direct file counts and long filenames

Use targeted search for imports and string mentions.

Do not inspect outside codebases.

## Measurements

Before and after editing, record:

- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- root orchestration direct file count
- old path string mentions in tests/scripts if touched
- tests outside owner folders
- long basename count in target areas
- top crowded directories

Update docs/build-infrastructure/structure-tree-pressure-report.md.

## Allowed work

1. Build a compatibility table in the pressure report.
2. Remove export-only files only when:
   - no internal imports remain
   - no package export points at it
   - no documented public entry need exists
   - no script/test requires it as a real module path
3. Keep files when package-facing safety is unclear.
4. For kept files, document reason and deletion condition.
5. Update string-only old path mentions only when they are stale implementation paths, not scenario data.
6. Move tiny owner files only when ownership is clear and it helps remove old entry pressure.

## Forbidden work

Do not implement features or change behavior.

Do not change output semantics, result truthfulness, provider config/auth, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write authority/approval behavior, verification/repair execution, session schema, CLI behavior, workflow coordinator, SessionManager, package scripts, build config, dependencies, or workspace packages.

Do not create generic dumping folders.

## Naming

Use short local names for any moved product files.

New product paths, product content, test names, generated docs, and commit message must avoid the forbidden vocabulary from the current chat instruction.

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

- package-facing safety is unclear for most files
- safe deletion batch is too small to improve measurements
- import churn becomes too large
- circular imports appear
- kept files need logic
- tests require behavior changes
- protected behavior would change
- build config or package scripts must change

## Completion criteria

COMPLETE only if:

- initial status is reported
- targeted inspection was performed
- before and after measurements are recorded
- at least three measurements improve
- safe deletion batch is applied or all candidates are classified with clear reasons
- compatibility table is updated
- no product behavior changes
- validation passes
- commit is created after validation
- push is attempted from clean committed state
- if first push attempt fails, do not retry
- pressure report is updated

## Commit and push

Commit after validation passes.

Codex may choose the commit message, but it must avoid forbidden vocabulary.

Push after commit only if status is clean and no unsafe artifact is included.

If first push attempt fails, do not retry.

## Final report

Include final status, initial status, inspection summary, before and after measurements, files removed, files kept with reasons, stale strings updated if any, validation result, commit hash and message, push status, behavior preservation notes, remaining debt, and next step.
