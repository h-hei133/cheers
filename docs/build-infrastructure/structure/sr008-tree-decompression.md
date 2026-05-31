# SR008: Tree Decompression

## Goal

Continue structural cleanup with higher efficiency after SR007.

SR007 moved only a small set of tests and left the visible tree still crowded. SR008 must be more aggressive while still preserving behavior.

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Reduce visible source tree pressure in larger chunks.

Prioritize:

- remaining root-level session tests
- core folders with mixed concerns
- dense orchestration leftovers
- dense patch result area
- zero-internal-import compatibility files
- root-level tests that already have clear owner folders

This work should be large enough to visibly change the tree.

## Banned words policy

New product file names, product code content, test names, generated docs, and commit message must not contain these user-banned words:

- route
- reference
- learning
- inspired
- sprint
- capstone
- closeout
- cut-through
- MVP

Do not mention outside project names in product code or generated report content.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- session root files and tests
- core shell, core tools, core query, and core context files
- orchestration remaining files
- orchestration patch result files
- edit result and patch files
- verification and repair remaining root files
- evidence and result remaining root files
- export-only compatibility files
- imports to compatibility files
- tests not beside owner code
- direct file counts by folder
- long visible filenames in target folders

Use targeted search for imports.

Do not inspect outside repositories.

If Serena is unavailable, use targeted search and report that honestly.

## Required measurements

Before editing, record:

- top crowded directories by direct file count
- direct file count for orchestration
- direct file count for orchestration patch result area
- direct file count for core
- direct file count for core shell
- direct file count for core tools
- direct file count for core query
- direct file count for session
- direct file count for result
- direct file count for evidence
- direct file count for verification
- direct file count for repair
- direct file count for edit
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

### 1. Move batches of tests beside owners

Move safe tests beside owner implementation.

Do not move only one or two tests unless a stop condition is hit.

Preferred minimum target: 10 test files moved if safe.

Candidate targets:

session/
  selection/
  replay/
  continuation/
  store/
  transcript/
  recovery/
  tree/

core/
  shell/
  tools/
  query/
  context/

orchestration/
  patch/
  result/
  journal/
  proposal/
  verify/

edit/
  patch/
  result/
  workspace/
  authority/
  multifile/

verification/
  command/
  failure/
  intent/
  result/

repair/
  flow/
  proposal/
  iteration/
  handoff/

Only move tests when owner is clear and behavior remains unchanged.

### 2. Move safe implementations into owner subfolders

Move implementations only when:

- owner is clear
- movement is path-only
- imports are manageable
- tests can validate behavior
- old path can be handled safely

Target patterns:

orchestration/patchResult/*
-> edit/patch/result/* or evidence/projection/* only when owner is clear

core/query/*
-> core/query/* subfolders or result/adapter/* only when owner is clear

core/context/*
-> context/* only when owner is clear

session root files
-> session/selection, session/replay, session/continuation, session/store, session/tree

verification root files
-> verification/command, verification/failure, verification/intent, verification/result

repair root files
-> repair/flow, repair/proposal, repair/iteration, repair/handoff

result root files
-> result/terminal, result/projection, result/adapter

evidence root files
-> evidence/verdict, evidence/ledger, evidence/projection, evidence/savepoint

Do not move a file when ownership is ambiguous.

### 3. Prune compatibility files with zero internal imports

For export-only compatibility files:

- remove only when no internal imports depend on them
- remove only when no public compatibility need is documented
- keep when public compatibility is unclear
- keep when deletion risk is unclear
- document kept files and deletion conditions

Do not break compatibility to improve appearance.

### 4. Update imports away from compatibility paths

Update safe internal imports.

Prioritize:

- tests moved in this work
- files in the same owner folder
- files already touched by movement
- simple imports with no circular risk

Do not rewrite high-risk files only for import purity.

### 5. Reduce direct file count in at least three visible areas

SR008 must improve at least three of:

- session
- core
- orchestration
- edit
- verification
- repair
- result
- evidence

If this cannot be achieved safely, report PARTIAL.

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
- change edit or apply behavior
- change verification or repair execution
- migrate session schema
- rewrite workflow coordinator
- rewrite SessionManager
- edit package scripts
- edit build config
- add dependencies
- add workspace packages
- create helper, utils, common, misc, shared, or support dumping grounds
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

Do not use banned words in new paths, tests, generated report content, or commit message.

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

- import churn becomes too large
- circular imports appear
- compatibility exports need logic
- tests require behavior changes
- result truthfulness changes unexpectedly
- provider config or auth behavior would change
- tool authority behavior would change
- edit/apply behavior would change
- verification/repair behavior would change
- build config or package scripts must change
- at least three visible areas cannot improve measurably

## Completion criteria

SR008 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- at least three visible areas improve measurably
- tests are colocated with owner code where safe
- safe implementation files are moved into owner subfolders where clear
- zero-internal-import compatibility files are pruned or classified
- internal imports are updated away from old paths where safe
- no product behavior changes
- focused tests pass
- build passes
- result contract check passes if relevant
- diff check passes
- commit is created after validation
- push is attempted after a clean committed state
- if first push attempt fails, do not retry
- commit message follows banned words policy
- pressure report is updated

## Commit and push policy

Committing is required after validation passes.

Codex may choose the commit message.

The commit message must avoid banned words.

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
9. Imports updated
10. Validation pass or fail
11. Commit hash and message
12. Push status
13. Behavior preservation notes
14. Stop conditions encountered if any
15. Remaining visible structure debt
16. Recommended next step
