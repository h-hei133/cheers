# Tools Registry Entry Trim

## Goal

Continue source tree cleanup after the compatibility policy cleanup.

This is structure work only. It must not implement product behavior.

Focus on the remaining tools registry old entry surface and its internal test import.

Expected final status: COMPLETE.

## Main objective

Remove internal use of the old tools registry entry and delete it only when safe.

At least three visible measurements should improve when safely possible.

At least one improved measurement must be:

- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- tools direct file count

## Initial status

Before editing, run git status.

If branch is ahead, attempt one push before editing. If push fails, do not retry.

Continue only if worktree is clean.

## Inspection

Use Serena targeted inspection before editing.

Inspect:

- latest structure pressure report
- tools/registry.ts
- concrete tools owner files under tools and core/tools
- tests importing tools/registry.ts
- package exports or documented public entry points if present
- internal imports to old tools entry paths
- direct file counts and long filenames

Use targeted search for imports and string mentions.

Do not inspect outside codebases.

## Measurements

Before and after editing, record:

- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- tools direct file count
- core/tools direct file count if touched
- tests importing old tools registry path
- tests outside owner folders for touched owners
- long basename count in target areas

Update docs/build-infrastructure/structure-tree-pressure-report.md.

## Allowed work

1. Replace internal test imports from the old tools registry entry with concrete owner paths.
2. Remove tools/registry.ts only when no internal imports remain and no package-facing need is documented.
3. Keep it when package-facing safety is unclear, and document reason plus deletion condition.
4. Move a small test only when ownership is clear and it helps remove the old import.
5. Keep retained old files as one-line exports only.

## Forbidden work

Do not implement features or change behavior.

Do not change tool execution, tool authority, command allowlists, provider config or auth, provider calls, fallback behavior, edit/apply/write authority/approval behavior, verification/repair execution, result truthfulness, session schema, CLI behavior, workflow coordinator, SessionManager, package scripts, build config, dependencies, or workspace packages.

Do not create generic dumping folders.

## Naming

Use short local names for any moved product files.

New product paths, product content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Validation

Run:

- focused tools tests for touched files
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, evidence, terminal, or output-facing code is touched
- git diff --check
- git status --short --branch
- git status after commit
- git status after push attempt

Do not claim validation passed unless actually run.

## Stop conditions

Stop and report PARTIAL if:

- package-facing compatibility safety is unclear and prevents deletion
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
- internal imports are updated away from the old tools registry entry where safe
- old entry is removed or classified
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
