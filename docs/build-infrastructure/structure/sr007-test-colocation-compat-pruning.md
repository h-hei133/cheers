# SR007: Test Colocation And Compatibility Pruning

## Goal

Continue visible source tree cleanup after SR006.

SR006 improved several owner folders but remaining visual debt still comes from:

- tests still living away from their owner code
- export-only compatibility files still visible in product folders
- root-level folders with mixed responsibilities
- old import paths that no longer need to be primary
- dense folders that need owner subfolders

SR007 must reduce this visible debt with measurable before and after numbers.

Expected final status: COMPLETE.

This is structure work only. It must not implement product behavior.

## Main objective

Make the source tree visibly cleaner by:

- colocating safe tests beside owner implementation
- pruning export-only compatibility files when safe
- isolating or documenting compatibility files that must remain
- updating internal imports away from old paths
- reducing direct file count in crowded folders
- keeping behavior unchanged

## Banned words policy

New product file names, product code content, test names, generated docs, and commit message must not contain these user-banned process or origin words:

- route
- reference
- learning
- inspired
- sprint
- capstone
- closeout
- cut-through
- MVP
- external project names

Do not mention outside project names in product code or generated report content.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- root-level tests in session, result, evidence, verification, repair, edit, core, orchestration
- export-only compatibility files from earlier structural work
- import references to compatibility files
- direct file counts by folder
- long visible filenames in target folders
- owner boundaries for session, result, evidence, verification, repair, edit, core, orchestration
- focused tests for candidate files

Use targeted search for imports.

Do not inspect outside repositories.

If Serena is unavailable, use targeted search and report that honestly.

## Required measurements

Before editing, record:

- top crowded directories by direct file count
- direct file count for orchestration
- direct file count for core
- direct file count for session
- direct file count for result
- direct file count for evidence
- direct file count for verification
- direct file count for repair
- direct file count for edit
- number of tests still outside owner folders
- export-only compatibility file count
- compatibility files with zero internal imports
- compatibility files still imported internally
- long basename count in target areas

After editing, record the same measurements.

Update:

docs/build-infrastructure/structure-tree-pressure-report.md

The report must include before and after numbers.

## Allowed work

### 1. Test colocation

Move tests beside owner code where owner is clear and movement is safe.

Suggested target patterns:

session/
  continuation/
  replay/
  tree/
  store/
  recovery/

result/
  terminal/
  projection/
  adapter/

evidence/
  verdict/
  ledger/
  projection/
  savepoint/

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

edit/
  patch/
  result/
  workspace/
  authority/
  multifile/

core/
  shell/
  tools/
  query/

Only move tests that can be updated without behavior changes.

### 2. Compatibility pruning

For export-only compatibility files:

- remove only if no internal imports depend on them and no compatibility reason is documented
- keep if external or public compatibility is still required
- keep if deletion risk is unclear
- document why kept
- update internal imports away from them where safe

Do not break compatibility to improve appearance.

### 3. Import cleanup

Update internal imports away from old paths where safe.

Prioritize:

- tests moved in this work
- product code in the same owner domain
- simple imports with no circular risk
- previous compatibility paths with zero reason to remain primary

Do not rewrite high-risk files just for import purity.

### 4. Folder pressure reduction

Reduce direct file count in at least two visible areas.

Candidate areas:

- session
- result
- evidence
- verification
- repair
- edit
- core
- orchestration

Do not move high-risk behavior files unless movement is strictly path-only and validated.

### 5. Compatibility status table

Add a compatibility table to the pressure report.

For each compatibility file considered, record:

- path
- kept or removed
- internal imports count
- reason
- deletion condition if kept

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

Do not use banned words in new product paths, test names, generated report content, or commit message.

## Validation

Required:

- focused tests for touched domains
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, evidence, terminal, or output-facing code is touched
- git diff --check
- git status --short --branch
- git status after commit
- git status after push

Do not claim validation passed unless actually run.

## Stop conditions

Stop and report PARTIAL if:

- compatibility pruning would break imports
- public compatibility requirement is unclear
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
- tree pressure does not improve measurably

## Completion criteria

SR007 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- tests are colocated with owner code where safe
- compatibility files are pruned or classified
- internal imports are updated away from old paths where safe
- at least two visible areas improve measurably
- no product behavior changes
- focused tests pass
- build passes
- result contract check passes if relevant
- diff check passes
- status is reported
- commit is created after validation
- push is performed only after clean committed state
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

Do not push failing or dirty states.

## Final report

Include:

1. Final status
2. Inspection summary
3. Before tree pressure snapshot
4. After tree pressure snapshot
5. Directories improved
6. Tests moved
7. Compatibility files removed, kept, or deferred
8. Imports updated
9. Validation pass or fail
10. Commit hash and message
11. Push status
12. Behavior preservation notes
13. Stop conditions encountered if any
14. Remaining visible structure debt
15. Recommended next step
