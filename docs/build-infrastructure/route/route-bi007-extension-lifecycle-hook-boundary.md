# Build Infrastructure Route BI007: Extension Lifecycle And Hook Boundary

## Goal

Implement the next Pi-inspired build-infrastructure route after BI006.

BI005 added static resource descriptors and metadata-only extension manifests.
BI006 audited the remaining Pi architecture patterns and recommended extension lifecycle and hook boundary as the immediate next route.

BI007 must introduce a safe extension lifecycle and hook contract without enabling dynamic plugin execution.

Target capabilities:

- extension lifecycle event contract
- hook registration model as static or internal contract
- hook result policy
- allowed and blocked hook effects
- integration with BI004 runtime events
- integration with BI005 static extension manifest metadata
- evidence and truthfulness guardrails for hook outcomes

Expected final status: COMPLETE.

This route is architecture infrastructure work, not a plugin system.

## Why this route exists

Pi extensions are powerful because they can subscribe to lifecycle events, register tools, commands, providers, renderers, and inject messages.

This project should learn the boundary design, but must not immediately copy dynamic plugin execution.

BI007 should build the safe middle layer:

static extension manifest
-> lifecycle contract
-> hook event names
-> hook result types
-> policy checks
-> runtime event projection
-> evidence-safe reporting

No arbitrary external extension code should run in this route.

## Owner domains

Primary owners:

- runtime/extensions
- runtime/events
- runtime/resources
- policy
- evidence
- result

Secondary owners only if needed:

- tools for hook result typing only
- provider for future provider-hook metadata only
- session for future extension-state placeholder only
- core/shell only for minimal display

Allowed target areas:

- packages/ts-shell/src/runtime/extensions
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/resources
- packages/ts-shell/src/policy
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/tools only for type integration
- packages/ts-shell/src/core/shell only for minimal display

Do not put extension logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- runtime/resources static descriptors from BI005
- runtime/events projection from BI004
- runtime turn/save point from BI002
- execution receipts and tool result split from BI003
- tools dispatcher and registry
- policy or capability boundary modules
- evidence and result truthfulness modules
- provider surfaces only if future provider hook metadata is relevant
- session surfaces only if extension-state placeholder is relevant

Inspect Pi reference repo with Serena:

- extensions API types
- extension runner or loader boundary
- lifecycle event map
- hook result types
- tool call hooks
- provider request hooks
- session event hooks
- resource discovery hooks
- command registration hooks
- renderer registration hooks
- extension state persistence guidance

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Extension lifecycle event contract

Define a local lifecycle event contract.

It should be host-neutral and report-safe.

Recommended event groups:

- session lifecycle
- turn lifecycle
- resource projection
- provider request preparation
- tool call preparation
- tool result projection
- execution receipt observation
- save point observation
- result observation
- session continuation observation

Only include events that match current project architecture.

Events are contracts, not execution.

### 2. Hook registration model

Add a static or internal hook registration boundary.

Rules:

- no dynamic plugin execution
- no package loading
- no filesystem discovery
- no external code import
- no network lookup
- no arbitrary user code
- no runtime side effects from hook registration

The registry may accept statically constructed internal hook descriptors for tests.

Each hook descriptor should record:

- hook id
- event kind
- owner domain
- allowed effect
- risk level
- requires opt-in
- supported status
- not-proven claims

### 3. Hook result policy

Define hook result types and policy.

Possible hook results:

- observe only
- annotate evidence
- request authority
- block action
- redact projection
- suggest next action
- unsupported
- rejected by policy

Forbidden hook results:

- force terminal success
- rewrite verification success
- rewrite repair success
- bypass authority
- execute provider by default
- execute tool by default
- mutate files
- run shell
- alter hidden transcript
- expose secrets

Hook result policy must make clear that hooks can influence policy and evidence, but cannot manufacture success outside result and verdict layers.

### 4. Integration with runtime events and resources

Connect extension lifecycle contract to existing BI004 runtime event projection and BI005 static extension manifests.

Minimum integration:

- static extension manifest can describe supported lifecycle events
- runtime event projection can include hook observation or hook policy outcome
- hook outcome can appear as evidence annotation or blocked action
- not-proven claims are preserved

Do not execute extension code.

### 5. Tool and provider hook placeholders

Add safe contract points for future hooks:

Tool hook placeholders:

- before tool call
- after tool result
- execution receipt observed

Provider hook placeholders:

- before provider request
- provider payload projection
- provider response observed

These are contracts only.

They must not change provider behavior or tool behavior in this route unless there is a tiny internal test-only descriptor that proves policy classification.

### 6. Extension state placeholder

Define what is deliberately not implemented:

- dynamic extension state persistence
- branch-aware state rebuild
- custom session entries
- custom renderer state

If adding a placeholder type, it must be metadata-only and marked not-proven.

## Required tests

Add focused tests only.

Test categories:

1. Lifecycle contract
   Supported event names and descriptors validate.

2. Hook policy
   Allowed hook outcomes are accepted and forbidden outcomes are rejected.

3. No dynamic execution
   Static extension manifest or hook descriptor cannot execute code.

4. Truthfulness
   Hook annotation, block, or observation cannot produce terminal success.

5. Runtime event integration
   Hook policy outcome can appear in event projection safely.

6. Resource integration
   Static extension manifest can declare lifecycle capability without enabling execution.

7. Redaction
   Hook descriptors and outcomes do not leak provider secrets, raw provider output, oldText, newText, command output, hidden reasoning, or transcripts.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no dynamic plugin execution
- no package loading
- no resource discovery expansion
- no provider default enablement
- no tool execution expansion
- no edit, verification, browser, or MCP expansion
- no session schema migration
- no broad runtime rewrite
- no new dependencies
- no Python runtime
- no contracts business logic
- no side effects outside ExecutionService or sanctioned owner
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement real plugin loading
- execute external extension code
- add package installation
- add dynamic discovery
- register real new tools
- register real new providers
- add command registration behavior
- add renderer registry behavior
- change provider request execution
- change tool execution behavior
- change edit or verification behavior
- migrate session storage
- create a route runner
- create a verify route script
- create JSON capability reports
- copy Pi extension API directly
- move files just to look like Pi

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI007 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- extension lifecycle event contract exists in the proper owner domain
- static or internal hook descriptor boundary exists
- hook result policy accepts safe outcomes and rejects forbidden outcomes
- static extension manifest metadata can reference lifecycle capabilities
- runtime event projection can carry hook policy outcome or hook observation safely
- hook outcomes cannot manufacture terminal success
- no dynamic plugin execution exists
- no provider/tool/edit/verification behavior is expanded
- focused tests pass
- build passes
- git diff --check passes
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires dynamic plugin loading or broad runtime rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Lifecycle event contract design
6. Hook registration boundary
7. Hook result policy
8. Runtime event integration
9. Static resource integration
10. Redaction behavior
11. Truthfulness behavior
12. Tests and validation pass or fail
13. Architecture constraints preserved
14. What remains deliberately not-proven
15. Recommended next route

## Next route

After BI007 is complete, continue with:

docs/build-infrastructure/route/route-bi008-session-branch-compaction-context-rebuild.md

BI008 should address session branch, compaction, branch summary, and context rebuild semantics without forcing a storage schema migration unless justified by audit.
