# Route 229: Product Architecture Reset Planning

## Goal

Pause feature development and plan a product architecture reset.

The project has grown route-by-route. It now contains real capabilities, but the structure exposes too much development history:

- route-named source/report/script artifacts
- overly long and mixed-purpose file names
- product code, evidence reports, route runners, verifiers, and historical docs mixed together
- module responsibility boundaries that do not map cleanly to physical structure
- orchestration, CLI/session, provider, edit, verification, repair, tool, evidence, and result layers crossing each other too freely

Route229 must produce a detailed planning document pack for a future structural refactor.

This route must not implement the refactor.

Expected final status: COMPLETE.

## Critical instruction

Do not assume the old module atlas is current truth.

The old module atlas may be used as historical input and responsibility vocabulary, but it is not the target architecture and may be stale.

Codex must inspect the current repository state, current active docs, current package scripts, current source layout, and recent Route227/228 changes before writing conclusions.

The route output should be code-informed, not memory-informed.

## Output directory

Create a new documentation directory:

docs/product-architecture-reset/

All Route229 output documents must live under this directory.

Do not put the new planning docs under docs/implementation-context.

Do not create another capability report JSON unless the repository already has a strong convention requiring a minimal route status artifact. This is not a capability proof route.

## Non-goals

Do not:

- move source files
- rename source files
- change product behavior
- add provider calls
- run live provider
- add new runtime capability
- add new route verifier unless absolutely necessary
- modify package scripts except if documentation validation already requires it
- delete old route artifacts
- archive files yet
- perform a broad mechanical refactor

This route is for architecture discovery, target design, and migration planning only.

## Core questions to answer

The document pack must answer these questions:

1. Which parts of the repository are product runtime?
2. Which parts are tests?
3. Which parts are route-era development artifacts?
4. Which parts are capability evidence / reports?
5. Which parts are harness / eval / verifier infrastructure?
6. Which old route artifacts should eventually be archived or quarantined?
7. Which file names expose development history and should eventually be renamed?
8. Which modules have responsibility overlap?
9. Which modules have physical directory mismatch?
10. Which files are oversized or cross-layer concentration points?
11. Which imports or dependencies indicate wrong direction?
12. What should the target product architecture look like?
13. What should remain as development-only infrastructure?
14. How should package scripts be renamed or grouped into product-level commands?
15. How can the refactor happen incrementally without breaking current capabilities?

## Required subagents

Use focused subagents. Do not make one main thread read everything.

Suggested subagents:

1. Product/runtime structure audit
   Inspect source directories and identify current product runtime boundaries, oversized files, route-named files, and cross-layer concentration points.

2. Docs/scripts/artifact hygiene audit
   Inspect docs, scripts, package scripts, route reports, verifiers, and historical artifacts. Identify what should stay current, move to archive, or become dev-only.

3. Module boundary audit
   Use the old module atlas only as historical vocabulary. Compare it against current code. Identify which responsibility modules exist physically, which are mixed, and which need public APIs.

4. Naming and public surface audit
   Inspect file names, exported names, package scripts, command names, and docs paths. Identify names that expose route history, MVP/capstone/cut-through language, or mixed responsibilities.

5. Reference architecture audit
   Inspect only targeted structure from selected reference repos. Compare architecture patterns, not detailed implementation.

Each subagent should produce concise findings with file/path examples and confidence level.

## Reference repository policy

Use references only for structure comparison, not feature copying.

Reference pool under /home/wang/projects:

- opencode
- OpenHands
- mini-swe-agent
- gemini-cli
- inspect_ai
- GitNexus
- graphiti
- mem0
- mempalace
- playwright-mcp
- stagehand

Recommended minimum references:

- opencode: service/module boundaries, tool/provider/session structure
- OpenHands: agent/conversation/runtime/tool separation
- mini-swe-agent: minimal loop clarity and file simplicity
- gemini-cli: CLI/core split, provider/context organization
- inspect_ai: eval/report/task separation

Optional references if relevant:

- GitNexus / graphiti for code graph and context structure
- mem0 / mempalace for memory structure
- playwright-mcp / stagehand for browser/tool structure

Do not broad-read all reference repositories. Inspect top-level structure and a few relevant subsystem files only.

The final docs must include adopted patterns, rejected patterns, and reasons.

## Required document pack

Create these documents under docs/product-architecture-reset/:

### 00-reset-charter.md

Purpose:

Define why the project needs a product architecture reset.

Must cover:

- why feature development is paused
- current structural symptoms
- product-vs-route distinction
- what this reset should achieve
- what it must not change yet
- evidence/proof-carrying innovation that must be preserved
- success criteria for the planning phase

### 01-current-structure-audit.md

Purpose:

Describe the current repository structure based on actual code.

Must cover:

- current package/source/doc/script layout
- product runtime areas
- route-era artifacts
- report/evidence artifacts
- verifier/eval/harness artifacts
- major concentration files
- route-named or history-leaking files
- oversized or mixed-responsibility files
- current dependency concerns
- current active docs vs historical/stale docs

Do not claim a file is wrong solely because of its name; explain why the name or location harms product architecture.

### 02-artifact-and-naming-hygiene.md

Purpose:

Define how to separate product architecture from development history.

Must cover:

- naming policy for product files
- naming policy for tests
- naming policy for verifiers
- naming policy for route/history docs
- naming policy for package scripts
- how to quarantine route-era artifacts
- how to handle files containing route/capstone/MVP/cut-through/closeout in names
- proposed archive/dev-only locations
- migration rules that avoid breaking existing scripts immediately

This document should include examples from the current repo, but should not rename files yet.

### 03-target-product-architecture.md

Purpose:

Propose the target physical architecture.

Do not blindly use the old 16-module list as directories.

Codex should infer the target structure from current code, current pain, and reference patterns.

Must include:

- target top-level source directory map
- which current responsibility modules become directories
- which responsibilities should remain contracts/facades rather than directories
- which directories own public APIs
- which directories are internal-only
- where evidence/claims/verdicts belong
- where provider/proposal/edit/verification/repair/tools/session/CLI belong
- where harness/eval/dev verifiers belong outside product runtime
- what should not import what

### 04-module-boundaries-and-dependency-rules.md

Purpose:

Define module ownership and dependency direction.

Must cover:

- owner vs consumer distinction
- public API/facade rules
- dependency direction rules
- forbidden imports
- allowed cross-module contracts
- evidence and receipt flow
- CLI/session/runtime/result boundaries
- provider/proposal/edit/verification/repair boundaries
- tool/browser/MCP boundaries
- docs/scripts boundary rules

This should be specific enough that future routes can enforce it, but should not require exact final filenames.

### 05-product-dataflow-and-lifecycle.md

Purpose:

Describe the intended product dataflow.

Must include diagrams or structured text for:

- user prompt to final verdict
- context/planning lifecycle
- provider to proposal lifecycle
- proposal to edit lifecycle
- edit to verification lifecycle
- verification failure to repair lifecycle
- tool/browser/MCP receipt lifecycle
- session continuation lifecycle
- evidence/claim/verdict lifecycle

The key rule:

Capabilities produce evidence; the evidence/verdict layer determines success; CLI/session only present truthful results.

### 06-migration-strategy.md

Purpose:

Plan the refactor in safe phases.

Must include:

- phase ordering
- suggested route sequence after Route229
- files/families likely touched per phase
- compatibility shims
- test strategy per phase
- rollback strategy
- stopping conditions
- what not to migrate first
- how to avoid breaking Route227/228 proven capabilities

Suggested phases may include, but Codex should adjust after inspection:

- artifact quarantine planning
- evidence/verdict layer extraction
- provider/proposal boundary cleanup
- edit/verification/repair boundary cleanup
- CLI/session/runtime split
- docs/scripts/package script hygiene
- final compatibility audit

### 07-testing-and-validation-strategy.md

Purpose:

Define how to validate the structural refactor.

Must cover:

- unit tests
- module boundary tests
- import/dependency checks
- product path smoke tests
- capability regression tests
- route/frozen evidence tests
- live provider opt-in tests
- docs/script hygiene checks
- what validations are required after each migration phase
- what validations are not required for docs-only planning

### 08-architecture-debt-register.md

Purpose:

Create a concrete debt register.

Each debt item should include:

- id
- title
- current evidence/path examples
- why it is a product architecture problem
- affected modules
- severity
- migration target
- suggested route/phase
- risk if ignored

Include debt around:

- route-grown artifacts
- route-named source/scripts/reports
- oversized orchestration
- CLI/session coupling
- provider/proposal classification spread
- verification/repair spread
- tools/browser/MCP local-vs-external evidence
- docs status confusion
- package script sprawl
- evidence/report/product runtime mixing

Codex may add other debt discovered from current code.

### 09-reference-architecture-comparison.md

Purpose:

Summarize reference repository structure lessons.

Must include:

- reference repo inspected
- files/directories inspected
- useful pattern
- rejected pattern
- reason
- local implication
- confidence level

Do not overfit to any one reference repo.

### 10-next-restructure-routes.md

Purpose:

Convert the architecture reset into future execution routes.

Must propose a small sequence of future restructure routes.

Each route should include:

- goal
- scope
- files/families likely affected
- non-goals
- validation
- stop conditions
- dependency on previous restructure routes

This must not continue feature development. It should be about structural migration.

## Important analysis requirements

Codex must inspect current code and docs before writing final documents.

At minimum, inspect:

- package.json scripts
- current source tree under packages/ts-shell/src
- entrypoints/cli-related files
- session/core shell files
- orchestration files
- provider/proposal/edit/verification/repair/tool files
- scripts directory structure
- docs directory structure
- DOC_STATUS or equivalent current docs status if present
- recent Route227/228 reports only as evidence of current route artifacts, not as architecture truth
- uploaded or repo module atlas only as historical input

If the actual repository differs from these assumptions, follow the repository.

## Validation

Because this is a planning route, do not run live provider.

Required validation:

- git diff --check
- git status --short --branch
- path existence check for docs/product-architecture-reset/*.md
- basic markdown sanity check if the project already has one

Do not run full build unless Codex touched product code, which should not happen.

Do not add Route229 verifier unless a lightweight docs index check is already standard and truly useful.

## Completion criteria

Route229 is COMPLETE only if:

- docs/product-architecture-reset/ exists
- all required documents 00-10 exist
- documents are based on current code inspection, not only stale atlas memory
- route-era artifact problem is explicitly analyzed
- naming/public surface problem is explicitly analyzed
- product vs dev artifact separation is explicitly analyzed
- target architecture is proposed with ownership and dependency rules
- migration strategy is phased and safe
- testing/validation strategy is included
- architecture debt register is actionable
- reference comparison includes adopted and rejected patterns
- future restructure routes are proposed
- no product code behavior is changed
- no live provider is run
- final response lists docs created, inspections performed, reference repos inspected, and unresolved uncertainties

## Final report

Do not paste all document contents.

Final response should include:

1. Final status
2. Docs created
3. Current code areas inspected
4. Reference repos inspected
5. Biggest structural findings
6. Product-vs-route artifact findings
7. Naming/public surface findings
8. Proposed target architecture summary
9. Proposed migration route sequence
10. Validation results
11. Files changed
12. Uncertainties or areas needing user decision
