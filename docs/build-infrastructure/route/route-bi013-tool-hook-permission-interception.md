# Build Infrastructure Route BI013: Tool Hook Permission Interception

## Goal

Implement the next build-infrastructure route after BI012 naming and origin cleanup.

BI003 added execution receipts and tool result content/details split.
BI007 added safe extension lifecycle and hook policy contracts.
BI010 added the agent loop contract.
BI011 added provider/model registry metadata.
BI012 cleaned product naming and origin vocabulary.

BI013 must connect tool hook policy to the existing tool and execution boundaries without adding new tools or dynamic extension execution.

Target capabilities:

- before-tool policy interception contract
- after-tool observation and annotation contract
- ExecutionService authority integration
- tool result details integration
- hook decision projection into runtime events
- evidence/result truthfulness guardrails
- no success rewriting from hooks

Expected final status: COMPLETE.

This route is architecture infrastructure work, not a new plugin system and not a new permission UI.

## Why this route exists

A strong agent runtime needs controlled tool interception.

The project already has:

- ExecutionService authority boundary
- tool result content/details split
- runtime event projection
- extension hook result policy
- no dynamic plugin execution
- evidence-backed result truthfulness

BI013 should make those pieces usable together:

tool call intent
-> before-tool policy
-> authority decision
-> ExecutionService or sanctioned owner
-> tool result details
-> after-tool observation
-> runtime event projection
-> evidence-safe result surface

Hooks may observe, annotate, request authority, block, redact, or suggest next actions.

Hooks must not execute arbitrary code, bypass authority, mutate files, run shell, or manufacture success.

## Owner domains

Primary owners:

- tools
- runtime/extensions
- runtime/events
- runtime/execution
- policy
- evidence
- result

Secondary owners only if needed:

- verification for command-stage policy observation
- provider only for future placeholder typing
- core/shell only for minimal display

Allowed target areas:

- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/extensions
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/policy
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/verification only if command-stage policy observation is needed
- packages/ts-shell/src/core/shell only for minimal display

Do not put hook logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol and file inspection:

- tools/types
- tools/resultSplit
- tools/dispatcher
- core/tools/runtime
- core/tools/registry
- runtime/extensions/lifecycle
- runtime/events/runtimeEventProjection
- runtime/execution/executionService
- runtime/execution/executionReceipt
- verification/commandStage if command tool policy is involved
- capability or policy boundary modules
- evidence and result truthfulness modules
- agent loop contract from BI010

Inspect the local external reference repository only for targeted comparison if needed:

- tool call hook boundary
- before-tool permission interception
- after-tool result annotation
- tool result details
- permission dialog or authority decision shape
- action event emission

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, continue only if targeted repository search is enough, and report that Serena was unavailable.

## Capability to build

### 1. Tool interception contract

Add a local tool interception contract.

It should represent:

- tool id or kind
- caller
- operation kind
- requested action summary
- authority mode
- risk level
- input redaction state
- hook policy outcomes
- decision status
- not-proven claims

This contract is report-safe.

It must not include:

- secrets
- provider config
- raw provider output
- raw oldText or newText
- unredacted command output
- hidden reasoning
- transcript dumps
- unsafe file contents

### 2. Before-tool policy decision

Add a before-tool decision model.

Allowed decisions:

- allow
- block
- request_authority
- redact_then_allow
- observe_only
- unsupported
- rejected

Decision metadata should record:

- reason
- policy source
- authority requirement
- redaction status
- safe user-facing summary
- not-proven claims

Forbidden behavior:

- execute tool
- bypass authority
- mutate file
- run shell
- call provider
- declare success
- alter hidden transcript

The decision model may be consumed by existing tool or command seams only where safe.

### 3. After-tool observation and annotation

Add an after-tool observation model.

It may record:

- tool result status
- execution receipt id
- result details id or safe summary
- redaction status
- annotations
- next-action suggestions
- blocked follow-up if needed
- not-proven claims

It must not rewrite tool result success into task success.

It must not rewrite verification or repair success.

### 4. ExecutionService authority integration

Connect tool interception to ExecutionService metadata.

Minimum integration:

- before-tool decision can mention ExecutionService authority mode
- execution receipt can reference a before-tool decision id or policy decision if safe
- blocked or authority-required decision prevents execution in the tested seam

Do not broaden command allowlists.

Do not add new execution paths.

### 5. Runtime event projection

Extend runtime event projection with tool interception observations.

Possible event kinds:

- tool policy decision observed
- tool authority requested
- tool call blocked
- tool result annotated
- tool interception unsupported

Events are observations, not verdicts.

terminalSuccessClaim must remain false.

### 6. Product seam consumption

Add one minimal product seam that consumes interception metadata.

Acceptable seams:

- existing tool dispatcher policy wrapper
- command-stage policy observation
- CLI/session display summary
- runtime event projection
- execution receipt projection

Do not add new tools.

Do not change real tool behavior broadly.

## Required tests

Add focused tests only.

Test categories:

1. Before-tool policy
   allow, block, request_authority, redact_then_allow, unsupported, and rejected are represented.

2. Forbidden outcomes
   Hook decisions cannot bypass authority, execute providers, run shell, mutate files, or force success.

3. ExecutionService integration
   authority-required or blocked decisions prevent execution in the tested seam, or are projected as not-executed if the seam is observation-only.

4. After-tool annotation
   annotations and next-action suggestions are report-safe and do not rewrite success.

5. Runtime event integration
   tool policy decisions and annotations appear as observation-only events.

6. Redaction
   no secrets, provider.env, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

7. Truthfulness
   tool allow, tool block, tool result, or hook annotation cannot become terminal success.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process or origin words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no dynamic plugin execution
- no package loading
- no dynamic discovery expansion
- no provider default enablement
- no real new tools
- no command registration behavior
- no renderer registry behavior
- no edit, verification, browser, or MCP expansion
- no command allowlist broadening
- no session schema migration
- no broad runtime rewrite
- no new dependencies
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement external extension execution
- add real new tool registrations
- add real command registrations
- add renderer registry behavior
- change provider request behavior
- broaden command execution
- change edit or verification behavior
- migrate session storage
- rewrite tool dispatcher broadly
- rewrite ExecutionService broadly
- create a route runner
- create a verify route script
- create JSON capability reports
- move files just to mirror an external project

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI013 is COMPLETE only if:

- targeted inspection was performed and reported
- before-tool interception contract exists in rightful owner domain
- after-tool observation and annotation contract exists
- hook policy decisions integrate with ExecutionService authority metadata or a tested product seam
- runtime event projection can carry tool policy outcomes safely
- at least one product seam consumes or exposes interception metadata
- forbidden outcomes are rejected
- hook/tool policy outcomes cannot manufacture terminal success
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires broad tool dispatcher rewrite or new permission UI, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Before-tool policy contract
6. After-tool annotation contract
7. ExecutionService authority integration
8. Runtime event integration
9. Product seam consumption
10. Redaction behavior
11. Truthfulness behavior
12. Tests and validation pass or fail
13. Architecture constraints preserved
14. What remains deliberately not-proven
15. Recommended next route

## Next route

After BI013 is complete, continue with:

docs/build-infrastructure/route/route-bi014-package-resource-governance.md

BI014 should address package and resource governance, trust policy, version pinning, enablement scope, and static inventory without package installation or dynamic loading.
