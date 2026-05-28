# Build Infrastructure Route BI003: Execution Receipt And Tool Details

## Goal

Implement the second Pi-inspired build-infrastructure route.

BI002 introduced:

- frozen turn snapshot
- runtime phase vocabulary
- evidence-only save point

BI003 must now strengthen the execution and tool-result boundary:

- ExecutionService result and error taxonomy
- runtime execution receipt projection
- tool result content/details split
- receipt integration into BI002 save points
- evidence/result/session-safe reporting

Expected final status: COMPLETE.

This is product architecture work. Do not create route-era runners, JSON capability reports, or verify route scripts.

## Why this route exists

BI001 identified Pi patterns worth adopting now:

- Result-style low-level error taxonomy
- tool result content/details split
- runtime receipt projection
- tool execution facts that are useful to UI, evidence, session, and future Rust executor boundary

BI002 added safe turn/save-point structure, but execution details are still likely scattered or overly string-based.

BI003 makes execution outcomes structured and report-safe.

## Owner domains

Primary owners:

- runtime
- runtime/execution
- evidence
- result
- tool or tool runtime if it exists
- session only if receipt carry-forward is needed

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/tool if present
- packages/ts-shell/src/session only for minimal receipt projection

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- runtime/execution/executionService.ts
- runtime turn boundary and save point from BI002
- evidence runtime save point
- result projection and terminal truthfulness
- tool execution or core tool registry
- command execution owners
- session surface only if receipt carry-forward is needed

Inspect Pi reference repo only for targeted comparison:

- tool result content/details model
- tool execution events or update events
- ExecutionEnv or shell/file Result-style errors
- tool execute and tool result handling
- event or receipt-like projections

Do not broad dump either repo.

Record inspected symbols/files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Execution result and error taxonomy

Add or refine structured execution outcome classification.

Execution outcomes should distinguish at least:

- success
- command_failed
- command_not_allowed
- command_unavailable
- timeout
- cancelled
- environment_error
- filesystem_error
- permission_denied
- policy_blocked
- invalid_request
- unknown_error

Use local project naming if an equivalent taxonomy already exists.

Do not collapse all failures into generic error.

Do not use exit code alone as task success.

Low-level execution errors must be report-safe.

They must not expose:

- secrets
- full command output
- private paths beyond current redaction policy
- provider env
- raw oldText or newText
- hidden reasoning

### 2. Runtime execution receipt projection

Add a structured receipt projection for execution attempts.

A receipt should include report-safe fields such as:

- receipt id
- caller
- operation kind
- authority mode
- requested action summary
- execution status
- error class
- exit code if relevant
- timeout or cancellation status
- output summary redaction status
- evidence correlation id
- turn snapshot id if available
- save point id if available
- not-proven claims

The receipt must not imply terminal success.

The receipt must be usable by:

- evidence save point
- result projection
- CLI/session display
- future Rust execution contract alignment

### 3. Tool result content/details split

If current tool results are string-heavy or mixed, add a local boundary that separates:

- model-visible content
- system-visible details
- report-safe projection

Content is what the model may see.

Details are structured runtime facts for UI, session, evidence, and result.

Report-safe projection is the redacted external-facing version.

This route does not need to rewrite all tools.

Minimum target:

- one core execution-backed tool path or command path emits a split result
- one failure path emits details and redacted projection
- tests prove model-visible content does not carry unsafe details

### 4. Save point integration

BI002 save points should be able to reference execution receipts.

Do not make save point imply success.

A save point may include:

- receipt ids
- receipt status summary
- error class summary
- redaction status
- observed-not-verdict facts
- not-proven claims

### 5. Result and session integration

Result/session surfaces may consume receipt projection only as evidence.

They must not upgrade:

- command dispatch
- tool execution
- exit code zero
- receipt success
- save point observed facts

into terminal success unless the existing evidence/verdict policy allows it.

## Required tests

Add focused tests only.

Test categories:

1. Error taxonomy
   Different failures classify differently.

2. Receipt redaction
   Receipts exclude secrets, raw output, provider env, raw oldText, raw newText, hidden reasoning, and full transcript content.

3. Content/details split
   Model-visible content and system-visible details are separated.

4. Save point integration
   Save point can reference receipts but cannot upgrade terminal success.

5. Result truthfulness
   Execution success or exit code zero alone cannot become verified task success.

6. Product integration
   A real local product seam emits or consumes receipt projection without route-local-only proof.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no broad runtime rewrite
- no provider default enablement
- no session schema migration unless strictly avoided and impossible otherwise
- no edit, verification, browser, or MCP capability expansion
- no Python runtime
- no contracts business logic
- no direct side-effect bypass outside ExecutionService or sanctioned owner
- no success outside evidence/verdict/result truthfulness

## What not to do

Do not:

- create a route runner
- create a verify route script
- create JSON capability reports
- rewrite all tools
- change provider behavior
- enable live provider
- broaden command allowlists
- change edit engine semantics
- change verification command selection semantics
- introduce extension loading
- introduce dynamic resources
- copy Pi file structure
- move files just to look like Pi

## Validation

Required:

- focused tests for touched modules
- npm run verify:result-contract if result/session terminal behavior is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Do not claim tests or build passed unless actually run.

## Completion criteria

BI003 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- execution outcomes have structured error taxonomy or a refined existing taxonomy
- runtime execution receipts exist in the proper owner domain
- at least one execution-backed product seam emits receipt evidence
- tool or command result content/details/report-safe projection is separated for at least one core path
- BI002 save point can reference receipt evidence without implying success
- result/session truthfulness is preserved
- redaction tests pass
- focused tests pass
- build passes
- git diff --check passes
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires broad runtime rewrite or tool system rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Error taxonomy design
6. Receipt projection design
7. Content/details split design
8. Save point integration
9. Result/session truthfulness behavior
10. Redaction behavior
11. Tests and validation pass/fail
12. Architecture constraints preserved
13. What was deliberately deferred to BI004
14. Recommended next route

## Next route

After BI003 is complete, continue with:

docs/build-infrastructure/route/route-bi004-session-tree-event-stream.md

BI004 should combine schema-neutral session tree projection and host-neutral runtime event stream planning or implementation, without migrating the session store schema unless explicitly justified.
