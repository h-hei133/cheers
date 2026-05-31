# SR015: Write Execution Core Split

## Goal

Continue structural cleanup after SR014.

SR014 reduced orchestration patchResult sharply, but the remaining files are higher risk. SR015 must inspect and move only files whose ownership is clear.

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Current repository state requirement

Before editing, check git status.

If the branch is ahead because the previous commit was not pushed, attempt one push before editing.

If that push fails, do not retry. Continue only if the worktree is clean.

## Main objective

Reduce the remaining write execution and orchestration output pressure without changing behavior.

At least two visible areas must improve measurably.

One improved area must be orchestration patchResult or root orchestration.

## User wording guard

New product file names, product code content, test names, generated docs, and commit message must avoid the user-banned vocabulary from the current chat instruction.

Do not mention outside codebase names in product code or generated report content.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- orchestration root files
- remaining orchestration patchResult files
- write execution files
- provider-gated write adjacency
- permission and approval adjacency
- write authority adjacency
- apply adjacency
- edit write owners
- edit authority owners
- edit patch owners
- edit result owners
- result projection owners
- evidence projection owners
- verification result owners
- repair handoff owners
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
- direct file count for edit write
- direct file count for edit authority
- direct file count for edit patch
- direct file count for edit result
- direct file count for result projection
- direct file count for evidence projection
- direct file count for verification result
- direct file count for repair handoff
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

### 1. Write execution split

Move safe write execution files only when ownership is clear.

Suggested destinations:

edit/write/
  runtime/
  policy/
  status/
  result/
  guard/

edit/runtime/
  write/
  apply/

Use exact folders only when they match current ownership.

Do not change write behavior.

Do not change apply behavior.

Do not change provider-gated write behavior.

### 2. Authority and approval split

Move permission, approval, and authority files only when ownership is clear.

Suggested destinations:

edit/authority/
  approval/
  policy/
  guard/
  state/
  projection/

Do not change permission behavior.

Do not change approval behavior.

Do not change write authority behavior.

### 3. Remaining output projection split

Move safe output projection files only when ownership is clear.

Suggested destinations:

edit/result/
  projection/
  status/
  mapper/

result/projection/
  write/
  patch/
  terminal/

evidence/projection/
  write/
  patch/
  claim/

verification/result/
  projection/
  failure/

repair/handoff/
  state/
  result/

Do not change result mapping.

Do not change terminal truth behavior.

Do not change verification or repair behavior.

### 4. Test colocation

Move tests beside owner implementation where safe.

Preferred minimum target: 10 tests moved if safe.

If ownership is unclear, leave the test and document why.

### 5. Compatibility control

For export-only compatibility files:

- avoid adding new compatibility files when internal imports can be fully updated safely
- remove only when no imports depend on them and no compatibility need is documented
- keep when public compatibility is unclear
- keep when downstream use is unclear
- document deletion condition for kept files

If compatibility count increases, explain every added file and deletion condition.

Do not break compatibility to improve appearance.

### 6. Import cleanup

Update safe internal imports away from old paths.

Prioritize:

- moved tests
- moved owner files
- same-folder consumers
- simple imports with no circular risk
- old paths with zero reason to remain primary

Do not rewrite high-risk files only for import purity.

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
- status

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
- provider-gated behavior would change
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
- orchestration patchResult or root orchestration cannot improve measurably

## Completion criteria

SR015 is COMPLETE only if:

- initial status and any pre-edit push attempt are reported
- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- orchestration patchResult or root orchestration improves measurably
- at least two visible areas improve measurably
- safe owner files are moved into owner subfolders where clear
- tests are colocated with owner code where safe
- compatibility files are pruned or classified
- compatibility growth is avoided or fully justified
- internal imports are updated away from old paths where safe
- no product behavior changes
- focused tests pass
- build passes
- result contract check passes if relevant
- diff check passes
- commit is created after validation
- push is attempted after clean committed state
- if first push attempt after commit fails, do not retry
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
2. Initial status and pre-edit push result if any
3. Inspection summary
4. Before tree pressure snapshot
5. After tree pressure snapshot
6. Directories improved
7. Files moved
8. Tests moved
9. Compatibility files removed, kept, or deferred
10. Compatibility count explanation
11. Imports updated
12. Validation pass or fail
13. Commit hash and message
14. Push status
15. Behavior preservation notes
16. Stop conditions encountered if any
17. Remaining visible structure debt
18. Recommended next step
