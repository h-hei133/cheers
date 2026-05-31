# SR016: Compatibility Retirement And Orchestration Trim

## Goal

Continue source tree cleanup after the latest structure pass.

The previous pass moved safe write-adjacent owner files, but root orchestration and export-only compatibility files still keep the tree visually noisy.

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Reduce visible tree pressure by safely retiring unused export-only compatibility files and trimming remaining root orchestration files only when ownership is clear.

At least three visible measurements must improve.

At least one improved measurement must be either:

- root orchestration direct file count
- export-only compatibility file count
- zero-internal-import compatibility file count

## User wording guard

New product file names, product code content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Initial status handling

Before editing, run git status.

If the branch is ahead because the previous commit did not reach upstream, attempt one push before editing.

If that push fails, do not retry.

Continue only if the worktree is clean.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- root orchestration files
- remaining orchestration patch output files
- export-only compatibility files
- compatibility files with zero internal imports
- compatibility files still imported internally
- package exports or documented public entry points if present
- tests still outside owner folders
- edit, result, evidence, verification, repair, session, core, runtime owner folders
- direct file counts by folder
- long visible filenames in target folders

Use targeted search for imports.

Do not inspect outside codebases.

If Serena is unavailable, use targeted search and report that honestly.

## Required measurements

Before editing, record:

- root orchestration direct file count
- orchestration patch output direct file count
- total export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- tests outside owner folders
- long basename count in target areas
- top crowded directories by direct file count

After editing, record the same measurements.

Update:

docs/build-infrastructure/structure-tree-pressure-report.md

The report must include before and after numbers.

## Allowed work

### 1. Compatibility retirement

For export-only compatibility files:

- remove only when no internal imports depend on them
- remove only when no package export or documented public compatibility need exists
- keep when downstream use is unclear
- keep when package-facing compatibility is unclear
- document why kept and deletion condition

Do not break compatibility to reduce file count.

### 2. Internal import cleanup

Update safe internal imports away from compatibility paths.

Prioritize:

- simple local imports
- tests already near owner code
- current owner folders
- moved code from recent structure passes

Do not rewrite high-risk files only for import purity.

### 3. Root orchestration trim

Move safe root orchestration files only when owner is clear.

Possible owners:

- edit
- verification
- repair
- evidence
- result
- runtime
- planning
- context
- provider
- tools
- session

Do not move central coordination files for appearance alone.

### 4. Test colocation

Move tests beside owner code where safe.

Preferred minimum target: 8 tests moved if safe.

### 5. Compatibility report table

Add a table to the pressure report for considered compatibility files:

- path
- removed or kept
- internal import count
- public compatibility status
- reason
- deletion condition if kept

## Forbidden work

Do not:

- implement features
- change output semantics
- change result truthfulness
- call providers
- change provider config or auth behavior
- change fallback behavior
- change tool execution or authority
- change command allowlists
- change edit, apply, write authority, approval, verification, or repair behavior
- migrate session schema
- rewrite workflow coordinator
- rewrite SessionManager
- edit package scripts
- edit build config
- add dependencies
- add workspace packages
- create dumping folders with generic names
- create JSON capability reports
- create new script runners

## Naming rules

Use short local names for any moved product files.

Do not use user-banned terms in new paths, tests, generated report content, or commit message.

## Validation

Required:

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

- compatibility safety is unclear for enough files to prevent improvement
- public compatibility risk cannot be bounded
- import churn becomes too large
- circular imports appear
- compatibility exports need logic
- tests require behavior changes
- result truthfulness changes unexpectedly
- protected runtime behavior would change
- build config or package scripts must change
- no visible metric can improve safely

## Completion criteria

SR016 is COMPLETE only if:

- initial status and pre-edit push result are reported when relevant
- targeted inspection was performed
- before and after measurements are recorded
- at least three visible measurements improve
- compatibility files are removed or classified
- internal imports are updated away from old paths where safe
- root orchestration is trimmed if safe
- no product behavior changes
- focused tests pass
- build passes
- result contract check passes if relevant
- diff check passes
- commit is created after validation
- push is attempted after clean committed state
- if first push attempt fails, do not retry
- commit message follows user wording guard
- pressure report is updated

## Commit and push policy

Committing is required after validation passes.

Codex may choose the commit message.

The commit message must avoid user-banned terms.

Push is allowed after the commit if validation passed, git status is clean, branch target is current upstream, and no unsafe artifact is included.

If the first push attempt fails, do not retry.

## Final report

Include:

1. Final status
2. Initial status and pre-edit push result if any
3. Inspection summary
4. Before measurements
5. After measurements
6. Files removed
7. Files moved
8. Tests moved
9. Compatibility files kept and why
10. Imports updated
11. Validation result
12. Commit hash and message
13. Push status
14. Behavior preservation notes
15. Remaining visible structure debt
16. Recommended next step
