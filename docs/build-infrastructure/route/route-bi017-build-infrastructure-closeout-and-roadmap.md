# Build Infrastructure Route BI017: Closeout And Roadmap

## Goal

Close the initial build-infrastructure sequence.

BI001 to BI016 studied and adapted a clean agent runtime architecture into this project while preserving owner-domain-first structure, truthfulness, ExecutionService boundaries, and no route-era product pollution.

BI017 must not implement new runtime features.

This is a closeout, audit, roadmap, and transition route.

Expected final status: COMPLETE.

## Why this route exists

The build-infrastructure sequence now includes:

- architecture planning
- turn snapshot
- runtime phases
- save points
- execution receipts
- tool result details
- session projection
- runtime events
- static resource metadata
- extension lifecycle and hook contracts
- session branch and compaction projections
- runtime API and JSON event stream
- agent loop contract
- provider and model registry metadata
- product naming cleanup
- tool hook permission interception
- package resource governance
- product surface message rendering
- agent loop integration spine

Before returning to real agent feature development, the project needs one closeout route that answers:

- what infrastructure is actually complete
- what is only contract or projection
- what remains not-proven
- which modules own which responsibilities
- how the agent loop spine connects the pieces
- which future work should be product feature work, not more infrastructure
- what route/history docs should say
- what should be committed or left out

## Required inspection

Use Serena targeted inspection if available.

Inspect current project:

- docs/build-infrastructure
- docs/build-infrastructure/route
- AGENTS.md
- agent-rules
- runtime
- runtime/loop
- runtime/events
- runtime/execution
- runtime/resources
- runtime/extensions
- turn
- session
- context
- tools
- provider
- policy
- presentation
- evidence
- result
- core/shell
- package.json only to understand scripts, not to add scripts

Do not inspect external repositories unless needed to confirm a deferred pattern.

This route should primarily audit local state.

If Serena is unavailable, use targeted repository search and report that honestly.

## Required output documents

Create or update these documents under docs/build-infrastructure:

1. build-infrastructure-closeout-summary.md

Must include:

- final status of BI001 to BI016
- what each route added
- owner domains changed
- what is product code
- what is docs only
- what is deliberately not-proven
- validation confidence
- risk notes

2. agent-loop-infrastructure-connection-map.md

Must include:

- prompt input
- turn snapshot
- runtime phase
- model/provider boundary
- provider/model metadata
- resource/package metadata
- extension lifecycle
- hook policy
- tool policy
- tool result details
- execution receipt
- save point
- next turn
- session active path
- context rebuild
- runtime events
- JSON event stream
- product surface rendering
- result and evidence truthfulness
- status for each connection:
  - connected
  - projection-only
  - contract-only
  - not-proven
  - deferred

3. build-infrastructure-owner-domain-map.md

Must include:

- runtime
- runtime/loop
- runtime/events
- runtime/execution
- runtime/resources
- runtime/extensions
- turn
- session
- context
- tools
- provider
- policy
- presentation
- evidence
- result
- core/shell
- what each owns
- what each must not own
- known compatibility exceptions

4. build-infrastructure-deferred-patterns.md

Must include:

- real provider streaming
- real tool batch execution through product loop
- product loop replacement
- SDK package
- RPC server
- TUI
- renderer plugins
- dynamic extension execution
- package installation or dynamic loading
- session storage migration
- storage-backed branching
- storage-backed compaction
- branch-aware extension state
- dynamic resource discovery
- provider request hooks and auth refresh
- parallel tool execution
- per-file mutation queue
- real product integration priorities

For each deferred pattern include:

- why deferred
- current supporting infrastructure
- blocker
- safest future route
- validation required

5. build-infrastructure-next-product-roadmap.md

Must recommend the next real product feature routes after infrastructure closeout.

It should prioritize:

- real CLI coding loop integration
- verification runtime dispatch and evidence
- context and planning quality hardening
- live provider beyond tiny controlled tasks
- repair loop through real CLI path
- multi-file product coding path
- browser and external tool product path only after local loop is stable

For each recommended product route include:

- goal
- owner domains
- existing infrastructure to reuse
- forbidden shortcuts
- validation expectations
- expected product value

6. Update docs/build-infrastructure/build-infrastructure-route-index.md if it exists.

The route index should include BI001 to BI017 and mark BI017 as closeout.

Do not create JSON reports.

Do not create route runners.

Do not create verify scripts.

## Audit tasks

### 1. Route sequence audit

Confirm that BI001 to BI016 are represented in docs.

For each route record:

- route id
- title
- status if known
- docs-only or product-code
- owner domains
- main artifact
- not-proven claims

If exact details are unavailable, say unknown instead of guessing.

### 2. Product code pollution audit

Check whether recent infrastructure work introduced:

- route-numbered product files
- external-origin product names
- process words in product filenames
- compatibility shim business logic
- helper, utils, common, misc, support dumping grounds
- provider default enablement
- package loading
- dynamic plugin execution

Document findings.

Do not do broad cleanup in this route unless it is tiny and safe.

### 3. Agent loop connection audit

Use BI016 as the backbone.

Confirm whether BI002 to BI015 infrastructure categories are:

- connected to loop trajectory
- only represented as metadata
- contract-only
- not-proven
- deferred

Do not overclaim.

### 4. Validation audit

Review recent validation claims if available from docs or local summaries.

Do not rerun all historical tests.

Run only closeout-required checks:

- git diff --check
- git status --short --branch

Run build only if product code is changed.

BI017 should be docs-only unless a tiny route index fix is needed.

### 5. Next work transition

Make clear that after BI017, the next route should not be more general infrastructure unless a blocker appears.

Recommended transition:

- from build infrastructure
- to real product feature route

The immediate next suggested product route should be:

Real CLI Coding Loop Integration

It should use the agent loop spine, provider registry, tool interception, execution receipts, session projection, product surface, and evidence/result truthfulness.

## Architecture constraints

Hard rules:

- docs-first closeout
- no product feature implementation
- no route runner
- no verify route script
- no JSON capability report
- no package script edits unless only DOC_STATUS or route index requires it
- no provider behavior change
- no tool behavior change
- no session schema migration
- no runtime rewrite
- no new dependencies
- no compatibility shim growth
- no dynamic plugin execution
- no package loading
- no product success claims outside evidence, verdict, and result truthfulness

## Validation

Required:

- git diff --check
- git status --short --branch

If product code is touched accidentally, revert it or run focused tests and build.

Do not claim build or tests passed unless actually run.

## Completion criteria

BI017 is COMPLETE only if:

- targeted local inspection was performed and reported
- closeout summary was created
- agent loop infrastructure connection map was created
- owner-domain map was created
- deferred patterns document was created
- next product roadmap was created
- route index was updated if present
- no product code was changed unless explicitly justified
- no route-era or external-origin product naming was introduced
- git diff check passes
- git status is reported
- final report recommends the next real product feature route

If local docs are missing or too inconsistent to close out, report PARTIAL and list exactly what is missing.

## Final report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. BI001 to BI016 summary
5. Agent loop connection status
6. Owner-domain map summary
7. Deferred patterns
8. Product code pollution audit result
9. Recommended next product route
10. Validation pass or fail
11. Files changed
12. Confirmation whether product code changed
