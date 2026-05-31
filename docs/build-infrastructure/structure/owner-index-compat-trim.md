# Owner Index Compatibility Trim

## Goal

Continue source tree cleanup after the harness compatibility trim.

This is structure work only. It must not implement product behavior.

Focus on remaining internally imported compatibility surfaces concentrated in owner index families under context, planning, provider, and tools.

Expected final status: COMPLETE.

## Main objective

Replace internal imports from broad owner index or old compatibility paths with concrete owner paths where safe.

At least three visible measurements must improve.

At least one improved measurement must be:

- internally imported compatibility file count
- export-only compatibility file count
- context owner index direct count
- planning owner index direct count
- provider owner index direct count
- tools owner index direct count

## Initial status

Before editing, run git status.

If branch is ahead, attempt one push before editing. If that push fails, do not retry.

Continue only if worktree is clean.

## Inspection

Use Serena targeted inspection before editing.

Inspect:

- latest structure pressure report
- remaining internally imported compatibility files
- context owner indexes and old context entry surfaces
- planning owner indexes and old planning entry surfaces
- provider owner indexes and old provider entry surfaces
- tools owner indexes and old tools entry surfaces
- imports to broad owner indexes and old paths
- package exports or documented public entry points if present
- tests outside owner folders for touched owners
- direct file counts and long filenames

Use targeted search for imports.

Do not inspect outside codebases.

## Measurements

Before and after editing, record:

- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- context index or entry direct file count if touched
- planning index or entry direct file count if touched
- provider index or entry direct file count if touched
- tools index or entry direct file count if touched
- tests outside owner folders for touched owners
- long basename count in target areas

Update docs/build-infrastructure/structure-tree-pressure-report.md.

## Allowed work

1. Replace internal imports from broad indexes or old paths with concrete owner paths.
2. Remove export-only files only when no internal imports remain and no package-facing need is documented.
3. Keep package-facing indexes when safety is unclear, and document reason plus deletion condition.
4. Move tiny owner files or tests only when ownership is clear and it helps remove old imports.
5. Keep retained compatibility files as one-line exports only.

## Forbidden work

Do not implement features or change behavior.

Do not change output semantics, result truthfulness, provider config or auth, provider calls, fallback behavior, tool authority, command allowlists, edit/apply/write authority/approval behavior, verification or repair execution, session schema, CLI behavior, workflow coordinator, SessionManager, package scripts, build config, dependencies, or workspace packages.

Do not create dumping folders with generic names.

## Naming

Use short local names for any moved product files.

New product paths, product content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Validation

Run focused tests for touched context, planning, provider, or tools owners.

Also run:

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
- internally imported compatibility count, export-only count, or one target owner index count improves
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

Include final status, initial status and any pre-edit push result, inspection summary, before and after measurements, files removed, files moved, tests moved, compatibility kept with reasons, imports updated, validation result, commit hash and message, push status, behavior preservation notes, remaining debt, and next step.
