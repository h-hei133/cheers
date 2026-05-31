# SR009: Core Context And Orchestration Decompression

## Goal

Continue structural cleanup after SR008 with a stronger focus on the remaining crowded areas.

SR008 improved session, edit, repair, and verification. SR009 must now focus on the areas that still make the source tree feel dense:

- orchestration
- orchestration patch result area
- core context
- core query
- core shell boundaries where safe
- remaining edit and verification adjacency only when owner is clear
- export-only compatibility growth

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Reduce visible source pressure in the remaining crowded areas while preserving behavior.

SR009 must improve at least three visible areas and must not increase compatibility exports without a clear documented reason.

Priority:

1. Move safe owner files and tests out of crowded orchestration folders.
2. Split core context and query files into clearer owner folders.
3. Move patch result related files into edit, evidence, result, or repair owner folders when ownership is clear.
4. Update safe internal imports away from old paths.
5. Classify and prune export-only compatibility files where safe.
6. Update the pressure report with before and after numbers.

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
- orchestration remaining files
- orchestration patch result area
- core context files
- core query files
- core shell files only for safe owner boundary decisions
- edit patch and result files
- verification command and failure files
- repair handoff and flow files
- evidence projection files
- result projection and terminal files
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
- direct file count for core context
- direct file count for core query
- direct file count for core shell
- direct file count for edit
- direct file count for verification
- direct file count for repair
- direct file count for evidence
- direct file count for result
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

### 1. Orchestration decompression

Move safe files out of orchestration when owner is clear.

Candidate owner destinations:

- context
- planning
- edit
- verification
- repair
- evidence
- result
- runtime
- provider
- tools

Do not move files with unclear ownership.

Do not move coordinator or central runtime control files for appearance alone.

### 2. Patch result owner split

For files under orchestration patch result area, classify ownership first.

Possible destinations:

edit/
  patch/
  result/
  workspace/
  authority/

evidence/
  projection/
  ledger/

result/
  projection/
  terminal/

repair/
  handoff/
  flow/

verification/
  result/
  failure/

Move only when ownership is clear.

Keep old path as thin export if compatibility is needed.

### 3. Core context and query split

Move safe core context and query files into owner folders where clear.

Possible destinations:

core/
  context/
    acquisition/
    delivery/
    window/
  query/
    mapping/
    terminal/
    adapter/
  shell/
    surface/
    session/
    output/

If a file really belongs outside core, move it to the correct owner domain instead.

Do not move shell host behavior if it risks behavior changes.

### 4. Test colocation

Move tests beside owner implementations.

Preferred minimum target: 15 test files moved if safe.

Only move tests when import updates are path-only and validation can cover them.

### 5. Compatibility control

Classify compatibility files:

- kept for public compatibility
- kept because downstream status is unclear
- removable because no imports and no documented need
- deletion candidate after internal imports reach zero

Remove only when safe.

Do not increase compatibility export count unless the moved owner file needs old path preservation.

If compatibility count increases, the final report must explain why and list deletion conditions.

### 6. Import cleanup

Update internal imports away from old paths where safe.

Prioritize:

- moved tests
- moved owner files
- simple local imports
- previous compatibility paths with no reason to remain primary

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
- mapper
- surface
- output
- window
- delivery

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

- ownership is unclear for the files needed to improve pressure
- import churn becomes too large
- circular imports appear
- compatibility exports need logic
- tests require behavior changes
- result truthfulness changes unexpectedly
- provider config or auth behavior would change
- tool authority behavior would change
- edit/apply behavior would change
- verification/repair behavior would change
- coordinator behavior would change
- SessionManager behavior would change
- build config or package scripts must change
- at least three visible areas cannot improve measurably

## Completion criteria

SR009 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- at least three visible areas improve measurably
- orchestration or core pressure is reduced measurably
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
9. Compatibility count explanation
10. Imports updated
11. Validation pass or fail
12. Commit hash and message
13. Push status
14. Behavior preservation notes
15. Stop conditions encountered if any
16. Remaining visible structure debt
17. Recommended next step
