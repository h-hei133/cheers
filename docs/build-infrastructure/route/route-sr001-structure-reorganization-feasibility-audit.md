# Structure Route SR001: Structure Reorganization Feasibility Audit

## Goal

Audit whether the project should be reorganized in place or rewritten as a new project.

This route is audit and planning only.

Do not implement product code.
Do not move files.
Do not rename files.
Do not rewrite imports.
Do not create a new project.

The goal is to evaluate the current repository structure, compare it with cleaner agent repository layouts, and produce a practical restructuring plan that preserves the current project advantages:

- Agent Loop contract
- evidence and truthfulness boundaries
- ExecutionService side-effect boundary
- Context and Planning block
- provider, tool, session, result, presentation domains
- focused test coverage
- no false-success discipline

Expected final status: COMPLETE.

## Why this route exists

The current repository has become functionally richer but structurally noisy.

Observed problems include:

- too many long multi-word file names
- too many files at the same folder depth
- product code, tests, scripts, docs, route artifacts, and historical compatibility are visually mixed
- package modules do not always have local src, test, and script boundaries
- module internals are not always grouped by sub-capability
- some old compatibility and route-era names still make the project feel messy
- Codex route prompts previously encouraged long descriptive file names
- context cost rises because broad modules require reading many neighboring files

The user has observed cleaner agent repositories where each package or module has its own scripts, src, and test structure, and where short file names can repeat under different folders.

SR001 must evaluate whether to:

- reorganize the existing project gradually
- rewrite a new project and migrate capabilities
- use a hybrid approach

## Core question

Which is simpler and more effective?

Option A:
Gradually reorganize the existing repository.

Option B:
Start a new clean project and migrate proven capabilities.

Option C:
Hybrid approach with a new clean package or module shell while keeping existing product code as compatibility source.

The audit must recommend one option and explain why.

## Required inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- package root layout
- packages/ts-shell
- packages/ts-shell/src
- packages/ts-shell tests
- scripts
- docs/build-infrastructure
- docs/dev-history if present
- agent-rules
- package.json scripts
- TypeScript path and export boundaries
- runtime domains
- orchestration domains
- context and planning domains
- provider domains
- tool domains
- session domains
- result and evidence domains
- presentation domains
- compatibility shims
- recent CP and PL code
- import graph hotspots
- largest folders
- longest file names
- files with mixed responsibilities
- files whose names encode process history instead of domain ownership

Inspect local reference repositories only for structure comparison, not code copying.

Reference pool may include local repositories under /home/wang/projects. Use only targeted inspection.

Compare structure patterns such as:

- package-local src, test, scripts layout
- nested domain folders
- short repeated file names under different modules
- public index or export files
- internal implementation folders
- adapters versus core folders
- host adapters versus runtime core
- command and script organization
- test colocation strategy
- fixture organization
- compatibility layer strategy

Do not copy external names, file layout, or product vocabulary into product code.

Docs may mention reference observations.

## Audit scope

### 1. Current structure inventory

Produce an inventory of the current repository structure.

Include:

- top-level packages
- package src layout
- test layout
- scripts layout
- docs layout
- compatibility shims
- historical route artifacts
- product domains
- owner domains
- high-churn folders
- high-risk folders
- large files
- long file names
- repeated process vocabulary
- import graph hotspots

### 2. Structural pain classification

Classify problems by severity.

Categories:

- blocker
- slows development
- cosmetic
- compatibility debt
- historical artifact
- false-success risk
- context-window risk
- import graph risk
- test ownership risk

Do not treat every long file name as a blocker.

The audit must distinguish real architecture problems from aesthetic discomfort.

### 3. Rewrite versus reorganize analysis

Compare the three options.

For each option include:

- expected benefit
- implementation cost
- risk of losing evidence and truthfulness
- risk of breaking tests
- risk of duplicating product code
- impact on current Agent Loop contract
- impact on Context and Planning block
- impact on provider/tool/session/result domains
- impact on user-facing development speed
- rollback strategy
- migration strategy
- recommended validation gates

The audit must make a recommendation.

### 4. Target structure proposal

Propose a target structure.

Evaluate at least two layouts.

Candidate layout A:
Keep current packages but introduce domain modules under packages/ts-shell/src.

Candidate layout B:
Create package-local modules under packages/ts-shell/modules, each with src, test, scripts.

Candidate layout C:
Split major domains into separate workspace packages.

The recommendation should consider TypeScript build simplicity, import churn, test discovery, package scripts, and Codex context efficiency.

The target structure may use repeated short file names inside module folders, such as:

- index
- types
- contract
- model
- policy
- events
- projection
- adapter
- runtime
- test
- fixtures

But the audit must avoid creating generic dumping grounds.

### 5. Module boundary proposal

Propose module boundaries for current domains.

Must cover:

- runtime
- runtime loop
- execution
- events
- turn
- context
- planning
- provider
- tools
- session
- evidence
- result
- presentation
- policy
- resources
- extensions
- verification
- repair
- edit

For each domain include:

- proposed module location
- internal src folders
- local tests
- local scripts if any
- public exports
- internal-only files
- compatibility exports
- dependencies allowed
- dependencies forbidden

### 6. Naming policy proposal

Create a naming policy for future files.

The policy should prefer:

- short file names inside meaningful folders
- repeated file names under different domains when appropriate
- folder names carrying context
- file names describing local role, not route history
- no external-origin names in product code
- no route, capstone, sprint, MVP, closeout, cut-through, reference, inspired, or project-origin names in product code

Examples of acceptable local file names:

- contract
- runtime
- events
- projection
- adapter
- policy
- receipt
- state
- summary
- boundary
- renderer
- registry
- plan
- graph
- memory

But the audit must explain when a longer name is justified.

### 7. Migration strategy

Propose a phased migration plan.

The plan must avoid one giant file move route.

Recommended phases:

- freeze current compatibility shims
- establish target module skeleton
- migrate one low-risk domain
- migrate tests with domain
- add local index exports
- preserve old import paths through thin compatibility exports
- update imports gradually
- run focused tests
- run build
- only then migrate next domain

The plan should identify first candidate domains.

Likely first candidates:

- presentation
- runtime/events
- runtime/loop
- runtime/resources
- provider registry
- context planning summary

High-risk domains should be delayed:

- SessionManager
- workflowExecutionCoordinator
- provider fetch
- edit/apply backend
- verification/repair execution

### 8. Validation strategy

Define validation for future restructuring routes.

Required categories:

- TypeScript build
- focused domain tests
- import compatibility tests
- result-contract if output/result touched
- CLI smoke if entrypoints touched
- git diff check
- status hygiene
- no product behavior change unless explicitly intended
- no false-success regression

### 9. Decision criteria

The audit must include clear decision criteria.

Recommend rewrite only if:

- current structure blocks product development
- migration cost is higher than rebuilding
- evidence/test contracts can be preserved
- feature parity migration plan exists
- old project can be kept as oracle
- product freeze is acceptable

Recommend in-place reorganization if:

- current behavior is valuable
- tests and evidence are hard to recreate
- problems are mostly structure and naming
- migration can be phased
- compatibility shims can protect imports

Recommend hybrid only if:

- a new module shell can absorb future work
- old code can delegate safely
- no duplicate truth sources are created

## Required output documents

Create these documents under docs/build-infrastructure:

1. structure-reorganization-feasibility-audit.md

Must include:

- current structure inventory
- structural pain classification
- rewrite versus reorganize comparison
- recommended option
- risks
- decision criteria
- evidence from local inspection
- reference repository structure observations

2. structure-reorganization-target-layout.md

Must include:

- proposed target layout
- rejected layouts
- module boundary proposal
- folder and file naming policy
- examples of before and after paths
- compatibility strategy
- import strategy

3. structure-reorganization-migration-roadmap.md

Must include:

- phased migration plan
- first candidate domains
- delayed high-risk domains
- validation gates
- stop conditions
- rollback strategy
- recommended first implementation route

Update docs/build-infrastructure/build-infrastructure-next-product-roadmap.md only if the audit changes the next route priority.

Do not create JSON reports.
Do not create route runners.
Do not create verify scripts.
Do not add package scripts.

## Architecture constraints

Hard rules:

- audit and docs only
- no product code changes
- no file moves
- no file renames
- no import rewrites
- no new workspace package
- no package script edits
- no build config edits
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no feature implementation
- no provider calls
- no session schema migration
- no product loop rewrite
- no new dependencies
- no success claims outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- start moving files
- start a new project
- rewrite modules
- rename product files
- change imports
- change tsconfig
- change package.json
- add package scripts
- add workspace packages
- delete historical docs
- hide compatibility exceptions
- copy another repository layout blindly
- claim tests passed if not run

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required because this is docs-only.

If product code is accidentally touched, revert it or run focused validation and explain why.

## Completion criteria

SR001 is COMPLETE only if:

- targeted inspection was performed and reported
- current structure inventory is documented
- rewrite versus reorganize comparison is documented
- a recommended option is chosen
- target layout proposal is documented
- module boundary proposal is documented
- naming policy is documented
- phased migration roadmap is documented
- first implementation route is recommended
- no product code was changed
- git diff check passes
- git status is reported

If repository structure is too unclear to recommend safely, report PARTIAL and list what must be inspected next.

## Final report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. Recommended option
5. Current structure pain summary
6. Target layout summary
7. First migration candidate
8. Delayed high-risk domains
9. Validation pass or fail
10. Files changed
11. Confirmation whether product code changed
