# SR013: Patch History Owner Split

## Goal

Continue structural cleanup after SR012.

SR012 reduced write, permission, apply, and patch output pressure. SR013 must focus on the remaining dense and higher-risk patch history, write-result, failure, and compatibility-adjacent files.

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Reduce the remaining patchResult and orchestration pressure without changing write, apply, approval, verification, repair, result, or evidence behavior.

At least three visible areas must improve measurably.

At least one improved area must be either:

- orchestration patchResult
- edit result
- result projection
- evidence projection
- verification result
- repair handoff

## User wording guard

New product file names, product code content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- orchestration patchResult remaining files
- write-result files
- patch history files
- journal files
- failure result files
- repair handoff files
- verification result files
- evidence projection files
- result projection files
- edit result files
- edit patch files
- edit authority files
- compatibility-only exports
- imports to compatibility files
- tests not beside owner code
- direct file counts by folder
- long visible filenames in target folders

Use targeted search for imports.

Do not inspect outside codebases.

If Serena is unavailable, use targeted search and report that honestly.

## Required measurements

Before editing, record:

- top crowded directories by direct file count
- direct file count for orchestration
- direct file count for orchestration patchResult
- direct file count for edit
- direct file count for edit result
- direct file count for edit patch
- direct file count for edit authority
- direct file count for verification result
- direct file count for repair handoff
- direct file count for evidence projection
- direct file count for result projection
- direct file count for result terminal
- tests still outside owner folders
- export-only compatibility file count
- zero-internal-import compatibility file count
- internally imported compatibility file count
- long basename count in target areas

After editing, record the same measurements.

Update:

docs/build-infrastructure/structure-tree-pressure-report.md

The report must include before and after numbers.

## Allowed work

### 1. Patch history owner split

Move safe patch history or journal files only when ownership is clear.

Suggested destinations:

edit/result/history/
edit/result/journal/
edit/result/projection/
evidence/projection/patch/
result/projection/patch/
repair/handoff/history/

Use exact folders only when they match current ownership.

Do not change patch history behavior.

Do not change journal content.

Do not change result mapping.

### 2. Failure and repair adjacency split

Move safe failure or repair-adjacent files only when the owner is clear.

Suggested destinations:

verification/result/failure/
verification/result/projection/
repair/handoff/state/
repair/handoff/journal/
repair/flow/result/
evidence/projection/failure/
result/projection/failure/

Do not change verification behavior.

Do not change repair behavior.

Do not change terminal result behavior.

### 3. Write-result projection split

Move safe write-result projection files only when ownership is clear.

Suggested destinations:

edit/result/projection/
edit/result/mapper/
edit/result/workspace/
result/projection/write/
evidence/projection/write/

Do not change write behavior.

Do not change apply behavior.

Do not change success mapping.

### 4. Test colocation

Move tests beside owner implementation where safe.

Preferred minimum target: 15 test files moved if safe.

If ownership is unclear, leave the test and document why.

### 5. Compatibility control

For export-only compatibility files:

- remove only when no imports depend on them and no compatibility need is documented
- keep when public compatibility is unclear
- keep when downstream use is unclear
- document deletion condition for kept files

Do not break compatibility to improve appearance.

If compatibility count increases, explain why.

### 6. Import cleanup

Update safe internal imports away from old paths.

Prioritize:

- moved tests
- moved owner files
- same-folder consumers
- simple imports with no circular risk
- old paths with zero reason to remain primary

Do not rewrite high-risk files just for import purity.

## Forbidden work

Do not:

- implement features
- change output semantics
- change result truthfulness
- call providers
- change provider opt-in
- change provider config loading
- change provider auth
- change fallback behavior
- change tool execution
- change command allowlists
- change browser execution behavior
- change browser permission behavior
- change edit behavior
- change apply behavior
- change write authority behavior
- change approval behavior
- change verification execution
- change repair execution
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

New product file names must be short and local.

Allowed examples:

- model
- state
- projection
- adapter
- runtime
- policy
- command
- failure
- flow
- proposal
- result
- receipt
- ledger
- truth
- stage
- plan
- writer
- guard
- summary
- journal
- selection
- mapper
- surface
- output
- window
- delivery
- apply
- parser
- approval
- authority
- history

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

- ownership is unclear for the files needed to improve pressure
- write behavior would change
- apply behavior would change
- approval behavior would change
- write authority behavior would change
- verification or repair behavior would change
- result truthfulness changes unexpectedly
- import churn becomes too large
- circular imports appear
- compatibility exports need logic
- tests require behavior changes
- provider config or auth behavior would change
- coordinator behavior would change
- SessionManager behavior would change
- build config or package scripts must change
- at least three visible areas cannot improve measurably

## Completion criteria

SR013 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- at least three visible areas improve measurably
- patchResult, edit result, result projection, evidence projection, verification result, or repair handoff improves measurably
- safe owner files are moved into owner subfolders where clear
- tests are colocated with owner code where safe
- compatibility files are pruned or classified
- compatibility growth is justified if it happens
- internal imports are updated away from old paths where safe
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

Push is allowed after the commit if:

- validation passed
- git status is clean
- branch target is the current upstream branch
- no secret, provider config, raw output, or unsafe artifact is included

If the first push attempt fails, do not retry.

Do not push failing or dirty states.

## Final report

Include:

1. Final status
2. Inspection summary
3. Before tree pressure snapshot
4. After tree pressure snapshot
5. Directories improved
6. Files moved
7. Tests moved
8. Compatibility files removed, kept, or deferred
9. Compatibility count explanation
10. Imports updated
11. Validation pass or fail
12. Commit hash and message
13. Push status
14. Behavior preservation notes
15. Stop conditions encountered if any
16. Remaining visible structure debt
17. Recommended next step
