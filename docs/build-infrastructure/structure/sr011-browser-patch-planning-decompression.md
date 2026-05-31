# SR011: Browser And Patch Planning Decompression

## Goal

Continue structural cleanup after SR010.

SR010 reduced compact context and workspace result pressure. SR011 must now focus on the remaining dense clusters:

- browser runtime cluster under core context
- browser skill runner cluster under core context
- patch planning cluster
- patch output and write execution adjacency
- permission and authority adjacency around patch output
- remaining tests outside owner folders
- compatibility files with no internal imports

This is structure work only. It must not implement product behavior.

Expected final status: COMPLETE.

## Main objective

Make the source tree visibly cleaner by splitting the remaining browser and patch planning clusters into owner folders with short local file names.

This pass must improve at least three visible areas.

At least one improved area must be either:

- core context browser cluster
- orchestration patch output or patch planning adjacency

## Banned terms policy

New product file names, product code content, test names, generated docs, and commit message must avoid the user-banned terms from the current instruction.

Do not mention outside project names in product code or generated report content.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- packages/ts-shell/src tree
- latest structure pressure report
- core context browser runtime cluster
- core context browser skill runner cluster
- core context browser receipt and summary adjacency
- orchestration patch output and patch planning files
- edit patch owners
- edit result owners
- edit workspace owners
- edit authority owners
- verification result and failure owners
- repair flow, proposal, and handoff owners
- evidence projection and ledger owners
- result projection and terminal owners
- permission and authority files adjacent to patch output
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
- direct file count for core/context browser runtime cluster
- direct file count for core/context browser skill runner cluster
- direct file count for orchestration patch output adjacency
- direct file count for patch planning adjacency
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

### 1. Browser runtime owner split

Move safe browser runtime files into clearer folders.

Suggested destinations:

core/context/browser/
  runtime/
  session/
  state/
  policy/
  summary/
  receipt/
  skill/

Use exact folders only when they match current ownership.

Do not change browser runtime behavior.

Do not change browser execution, permission, network, or tool behavior.

### 2. Browser skill owner split

Move safe browser skill runner files into clearer folders.

Suggested destinations:

core/context/browser/skill/
  runtime/
  result/
  policy/
  state/
  projection/

Only move when ownership is clear.

Do not change skill execution behavior.

### 3. Patch planning and output split

Classify patch planning and output files before moving.

Suggested destinations:

edit/patch/
  plan/
  apply/
  parser/
  result/

edit/result/
  projection/
  journal/
  mapper/
  workspace/

edit/authority/
  policy/
  approval/

verification/result/
  projection/
  status/

repair/handoff/
  state/
  journal/

evidence/projection/
  patch/
  claim/

result/projection/
  patch/
  terminal/

Move only when ownership is clear.

Keep old paths as thin exports when compatibility is needed.

### 4. Permission and authority adjacency

Move permission or authority related files only when the owner is clear.

Do not change permission behavior.

Do not change approval behavior.

Do not change write authority behavior.

### 5. Test colocation

Move tests beside owner implementation where safe.

Preferred minimum target: 20 test files moved if safe.

If ownership is unclear, leave the test and document why.

### 6. Compatibility control

For export-only compatibility files:

- remove only when no imports depend on them and no compatibility need is documented
- keep when public compatibility is unclear
- keep when downstream use is unclear
- document deletion condition for kept files

Do not break compatibility to improve appearance.

If compatibility count increases, explain why.

### 7. Import cleanup

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
- change edit or apply behavior
- change verification or repair execution
- change approval behavior
- change write authority behavior
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
- browser
- skill
- apply
- parser
- approval

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
- browser behavior would change
- browser permission behavior would change
- skill execution behavior would change
- edit/apply behavior would change
- write authority behavior would change
- verification/repair behavior would change
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

SR011 is COMPLETE only if:

- targeted inspection was performed
- before and after tree pressure snapshots are recorded
- at least three visible areas improve measurably
- browser cluster or patch planning adjacency improves measurably
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
