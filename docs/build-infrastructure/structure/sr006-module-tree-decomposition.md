# SR006: Module Tree Decomposition

## Goal

Continue structural cleanup until the visible project tree is materially cleaner.

Previous structure work moved many implementations into owner folders, but the repository can still feel crowded because large folders remain dense, compatibility exports remain visible, and some domains do not yet have enough nested structure.

SR006 must reduce visible tree pressure more aggressively.

Expected final status: COMPLETE.

This is structure work only. It must not implement product behavior.

## Main objective

Make the source tree visibly cleaner by moving files into owner subfolders and colocating tests.

The outcome must be measurable.

Before and after measurements are required.

## Required focus

Prioritize crowded areas that still make the project look messy:

- packages/ts-shell/src/orchestration
- packages/ts-shell/src/core
- packages/ts-shell/src/session
- packages/ts-shell/src/result
- packages/ts-shell/src/evidence
- packages/ts-shell/src/verification
- packages/ts-shell/src/repair
- packages/ts-shell/src/edit

Do not move everything blindly.

Classify files first, then move safe groups.

## Forbidden words policy

New product file names, new product code content, test names, generated docs, and commit message must not contain these user-banned process or origin words:

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

Do not mention outside project names in product code or generated status text.

This document may exist as a planning instruction, but new product artifacts must follow the policy above.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- current source tree under packages/ts-shell/src
- direct file counts by folder
- longest visible file names
- compatibility-only exports
- test files still far from owner files
- import references for candidate files
- orchestration remaining files
- core remaining files
- session structure
- result and evidence structure
- verification and repair structure
- edit structure
- recent structure pressure report if present

Use targeted repository search for imports.

Do not inspect outside repositories.

If Serena is unavailable, use targeted search and report that honestly.

## Required measurements

Before editing, record:

- top crowded directories by direct file count
- folders with many tests not beside owner code
- compatibility-only export count
- direct file count for orchestration
- direct file count for core
- direct file count for session
- direct file count for result
- direct file count for evidence
- direct file count for verification
- direct file count for repair
- direct file count for edit
- files with long basenames in target areas
- real imports still using compatibility paths

After editing, record the same measurements.

Update:

docs/build-infrastructure/structure-tree-pressure-report.md

The report must show before and after numbers.

## Allowed work

### 1. Move tests beside owner code

Move safe tests next to their implementation owner.

Examples of desired style:

- session/continuation/readiness.test.ts
- session/replay/state.test.ts
- result/terminal/truth.test.ts
- evidence/verdict/facade.test.ts
- verification/command/stage.test.ts
- repair/iteration/flow.test.ts
- edit/result/projection.test.ts

Use the exact path only if it matches the current owner.

### 2. Split crowded folders into owner subfolders

Allowed target patterns:

session/
  tree/
  replay/
  continuation/
  store/
  transcript/
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

Use short local filenames such as:

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

Do not create dumping grounds.

### 3. Move safe implementation files

Move real implementations only when:

- owner is clear
- imports are manageable
- behavior does not change
- tests can move with the implementation
- old path can become a thin export or all imports can move safely

Old compatibility exports must contain no business logic.

### 4. Update imports

Update internal imports to owner paths where safe.

Prioritize:

- moved tests
- moved implementations
- nearby domain consumers
- product code with simple import changes

Do not rewrite high-risk files just for import purity.

### 5. Compatibility cleanup

Classify compatibility-only files:

- keep temporarily
- safe to remove
- safe to move later
- public compatibility required
- internal imports must be updated first

Remove only when safe.

Do not break old imports unless no compatibility requirement remains.

## High-risk areas

Do not rewrite these for structure alone:

- SessionManager
- workflow coordinator
- provider config or auth behavior
- edit/apply backend behavior
- verification execution behavior
- repair execution behavior
- CLI entry behavior
- result success mapping

Moving a file is allowed only if it does not change behavior and imports remain safe.

## Required validation

Run focused tests for all touched domains.

Likely suites include:

- session tests
- result tests
- evidence tests
- verification tests
- repair tests
- edit tests
- core tests if touched
- runtime tests if imports are touched
- product surface tests if output-facing imports are touched

Also run:

- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, evidence, terminal, or output-facing code is touched
- git diff --check
- git status --short --branch

Do not claim validation passed unless actually run.

## Stop conditions

Stop and report PARTIAL if:

- import churn becomes too large
- circular imports appear
- compatibility exports require logic
- tests require behavior changes
- result truthfulness changes unexpectedly
- provider config or auth behavior would change
- tool authority behavior would change
- edit/apply behavior would change
- verification/repair behavior would change
- build config or package scripts must change
- tree pressure does not improve measurably

## Completion criteria

SR006 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- at least two crowded visible areas improve measurably
- tests are colocated with owner code where safe
- implementation files are moved into owner subfolders where safe
- compatibility files are classified
- no product behavior changes
- focused tests pass
- build passes
- result contract check passes if relevant
- diff check passes
- status is reported
- commit is created after validation
- push is performed only after a clean committed state
- commit message follows the forbidden words policy

## Commit and push policy

Committing is required after validation passes.

Codex may choose the commit message.

The commit message must avoid the user-banned words.

Pushing is allowed after the commit if:

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
6. Files moved
7. Tests moved
8. Compatibility files kept, removed, or deferred
9. Imports updated
10. Validation pass or fail
11. Commit hash and message
12. Push status
13. Behavior preservation notes
14. Remaining visible structure debt
15. Recommended next step
