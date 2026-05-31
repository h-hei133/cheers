# SR010: Context And Patch Output Decompression

## Goal

Continue structural cleanup after SR009.

SR009 reduced core context, core query, and patch-result pressure. SR010 must continue with the remaining dense clusters:

- browser and compact clusters inside core context
- patch output and write-result adjacency
- remaining verification, repair, edit, evidence, and result ownership around patch outcomes
- compatibility files that have zero internal imports
- tests still outside owner folders

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Make the remaining crowded folders visibly cleaner.

This pass must improve at least three visible areas, and at least one of them must be either core context or orchestration patch-result adjacency.

## Banned terms policy

New product file names, product code content, test names, generated docs, and commit message must avoid the user-banned terms from the current instruction.

Do not mention outside project names in product code or generated report content.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- core context browser cluster
- core context compact cluster
- core context model and delivery clusters
- orchestration patch-result adjacency
- edit patch and result owners
- edit workspace and authority owners
- verification result and failure owners
- repair flow, proposal, and handoff owners
- evidence projection and ledger owners
- result projection and terminal owners
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
- direct file count for core/context
- direct file count for core/context browser cluster
- direct file count for core/context compact cluster
- direct file count for orchestration patch-result adjacency
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

### 1. Core context cluster split

Move safe browser and compact context files into clear owner folders.

Suggested destinations:

core/context/browser/
  runtime/
  summary/
  state/
  policy/

core/context/compact/
  model/
  projection/
  policy/
  state/

core/context/delivery/
  window/
  projection/
  continuation/

Use exact folders only when they match current ownership.

Do not move browser behavior if it changes runtime behavior.

Do not move compact behavior if it changes context semantics.

### 2. Patch output ownership split

Classify patch-result adjacency before moving.

Suggested destinations:

edit/patch/
  plan/
  apply/
  result/

edit/result/
  journal/
  projection/
  mapper/

verification/result/
  projection/
  status/

repair/handoff/
  journal/
  state/

evidence/projection/
  patch/
  claim/

result/projection/
  patch/
  terminal/

Move only when ownership is clear.

Keep old paths as thin exports when compatibility is needed.

### 3. Test colocation

Move tests beside owner implementation where safe.

Preferred minimum target: 20 test files moved if safe.

Do not move tests if ownership is unclear or validation would become too broad.

### 4. Compatibility pruning and classification

For export-only compatibility files:

- remove only when no internal imports depend on them and no compatibility need is documented
- keep when public compatibility is unclear
- keep when downstream use is unclear
- document deletion condition for kept files

Do not break compatibility to improve appearance.

If compatibility count increases, explain why.

### 5. Import cleanup

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
- change edit or apply behavior
- change verification or repair execution
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
- compact
- browser

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

SR010 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- at least three visible areas improve measurably
- core context or patch-result adjacency improves measurably
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
- commit message follows banned terms policy
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
