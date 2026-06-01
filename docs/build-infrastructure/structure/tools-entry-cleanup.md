# Tools Entry Cleanup

## Goal

Continue source tree cleanup after removing the obsolete tools registry entry.

This is structure work only. It must not implement product behavior.

Focus only on remaining root tools entry files that appear to be export-only surfaces.

Expected final status: COMPLETE.

## Main objective

Reduce root tools visual pressure while preserving package-facing safety.

Target files to inspect include:

- tools/dispatcher.ts
- tools/interception.ts
- tools/resultSplit.ts

Do not touch tool execution behavior.

## Initial status

Before editing, run git status.

If branch is ahead, attempt one push before editing. If push fails, do not retry.

Continue only if worktree is clean.

## Inspection

Use Serena targeted inspection before editing.

Inspect:

- latest structure pressure report
- root tools files
- tools/dispatch owner files
- tools/policy owner files
- tools/result owner files
- core/tools files only for import safety
- package exports or documented public entry points if present
- internal imports to root tools entries
- script, test, and string module-path mentions for root tools entries
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
- tests importing root tools entries
- long basename count in target areas

Update docs/build-infrastructure/structure-tree-pressure-report.md.

## Allowed work

1. Replace internal imports from root tools entries with concrete owner paths.
2. Remove root tools entry files only when no internal imports remain, no package export points at them, no documented public entry need exists, and no script/test requires them as real module paths.
3. Keep entries when package-facing safety is unclear, and document reason plus deletion condition.
4. Move tiny tests only when ownership is clear and it helps remove old imports.
5. Keep retained entries as one-line exports only.

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

- package-facing safety is unclear and no visible measurement can improve safely
- import churn becomes too large
- circular imports appear
- retained entries need logic
- tests require behavior changes
- protected behavior would change
- build config or package scripts must change

## Completion criteria

COMPLETE only if:

- initial status is reported
- targeted inspection was performed
- before and after measurements are recorded
- tools direct file count or export-only count improves, or all candidates are classified with clear reasons
- removed entries are proven safe to remove
- retained entries are documented with deletion conditions
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

Include final status, initial status, inspection summary, before and after measurements, files removed, files kept with reasons, tests moved, imports updated, validation result, commit hash and message, push status, behavior preservation notes, remaining debt, and next step.
