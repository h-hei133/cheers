# Route 150: Runtime - receipt contract integration

## Module

- Primary module: Runtime Engineering
- Secondary modules: Tool Engineering, Result Surface Engineering, Session / Continue Engineering, Harness / Eval Engineering
- Capability: runtime execution receipt contract
- Cross-module inputs:
  - Tool / Policy / Result receipt vocabulary
  - sandbox / local command execution facts
  - daemon / runtime context facts
  - browser runtime status and cleanup facts
  - session transcript and replay-safe summary rules
- Cross-module outputs:
  - shared runtime receipt object
  - runtime receipt projection
  - result/session-safe runtime summaries
  - focused tests and validation evidence
- Product behavior boundary:
  - normalize and project existing runtime execution facts
  - do not add new execution capability
  - do not change command allowlist, browser scope, provider behavior, edit behavior, or CLI UX
- Stop conditions:
  - any need to change Rust protocol behavior
  - any need to broaden shell/browser/edit/provider execution
  - any schema/persistence change
  - any package/dependency change
  - any broad runMvp rewrite
- Capability lifecycle stage(s):
  - availability: classify runtime availability and readiness facts
  - policy: consume existing policy outcomes; do not decide policy
  - planning: none, projection only
  - execution: summarize existing execution outcomes
  - observation: project stdout/stderr/browser/runtime observations safely
  - evidence: produce replay-safe runtime evidence
  - result mapping: feed existing Tool / Policy / Result vocabulary
  - transcript: produce transcript-safe summaries
  - continue / replay: provide compact replay-safe runtime summary
  - eval: add focused receipt tests and existing gates
  - report: document receipt mapping and validation
  - cleanup: represent cleanup/teardown status
  - redaction: prevent raw dumps and secrets in summaries

## Goal

Create a shared Runtime Receipt contract and integrate it into high-value execution paths without changing runtime behavior.

Route 149 reset the roadmap to module-first development. The default next route is Runtime Receipt Contract because Route 146 already introduced Tool / Policy / Result vocabulary, but runtime execution paths still project capability-specific receipts.

Route 150 should reduce coupling between Runtime, Tool, Result Surface, Session, Browser, and Harness by adding a shared runtime receipt seam.

This route is successful when:

- [ ] a shared runtime receipt type/projection exists
- [ ] shell/local command, sandbox, browser runtime, and timeout/cleanup facts can map into it
- [ ] result/session-safe runtime summaries are tested
- [ ] high-value current call sites consume the projection without behavior drift
- [ ] runMvp and package baseline remain green
- [ ] owning module, lifecycle stage, inputs/outputs, boundary, validation gate, and stop conditions are explicit

This route is not successful if:

- [ ] it only writes docs without reducing runtime/result coupling
- [ ] it changes command execution, browser execution, provider behavior, edit behavior, or CLI behavior
- [ ] it moves control-plane semantics into Rust
- [ ] it weakens sandbox, permission, redaction, or result truthfulness
- [ ] it adds a new runtime layer instead of projecting current runtime facts

## References

Target project evidence:

- `docs/architecture/module-roadmap-reset.md`
- `docs/architecture/module-backlog.md`
- `docs/agent-routes/module-route-template.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/runmvp-package-closeout.md`

Reference projects to inspect:

- opencode: process / pty / tool execution receipt shape
- OpenHands: sandbox runtime action/observation shape
- ClaudeCode: tool execution and permission/result surface shape
- gemini-cli: tool-call lifecycle and execution result shape
- Inspect AI: task/log/report receipt shape
- mini-swe-agent: command execution trajectory shape
- Playwright MCP: browser runtime/tool error receipt shape

Reference budget:

- opencode: max 10 files
- OpenHands: max 8 files
- ClaudeCode: max 8 files
- gemini-cli: max 8 files
- Inspect AI + mini-swe-agent + Playwright MCP: max 10 files total
- Stop condition for reference reading: stop once receipt fields, timeout/cancel/cleanup, and redaction/report shape are clear

## Current Project Surfaces

Files likely involved:

- `packages/ts-shell/src/core/tools/toolPolicyResult.ts`
- `packages/ts-shell/src/core/tools/toolResultProjection.ts`
- `packages/ts-shell/src/core/tools/toolLifecycleProjection.ts`
- `packages/ts-shell/src/core/tools/toolExecutionProvenance.ts`
- `packages/ts-shell/src/core/tools/runtime.ts`
- `packages/ts-shell/src/sandbox/sandboxPolicy.ts`
- `packages/ts-shell/src/core/shell/runtimeContext.ts`
- `packages/ts-shell/src/core/context/pwRuntime.ts`
- `packages/ts-shell/src/core/context/browserTxn.ts`
- `packages/ts-shell/src/core/context/browserTrace.ts`
- `packages/ts-shell/src/core/context/browserTxnReport.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/session/sessionContinuationProjection.ts`
- `packages/ts-shell/src/session/sessionSummaryProjection.ts`
- existing runtime / sandbox / browser / tool tests

Likely new files:

- `packages/ts-shell/src/core/runtime/runtimeReceipt.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceipt.test.ts`
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.test.ts`
- `docs/architecture/runtime-receipt-contract.md`

Current ownership:

| File | Primary module | Secondary modules | Current role | Drift risk |
|---|---|---|---|---|
| `core/tools/runtime.ts` | Tool | Runtime, Result Surface | executes/project tool runtime outcomes | local result shapes diverge from shared receipt |
| `sandbox/sandboxPolicy.ts` | Runtime | Permission / Policy | sandbox process/path policy facts | receipt may accidentally change policy semantics |
| `core/shell/runtimeContext.ts` | Runtime | Session | runtime context and substrate facts | fallback behavior can drift if receipt owns decisions |
| `core/context/browser*` | Browser | Runtime, Result Surface | browser runtime status, cleanup, report | browser receipt can leak raw content if not redacted |
| `toolPolicyResult.ts` | Tool | Result Surface | shared tool/policy/result vocabulary | runtime receipt must consume, not replace, this seam |
| `sessionContinuationProjection.ts` | Session / Continue | Result Surface | replay-safe evidence selection | runtime summaries must remain replay-safe |

## Allowed Changes

- Add shared runtime receipt type and projection helpers.
- Add focused helper tests.
- Integrate high-value duplicate call sites where behavior can be preserved.
- Add docs for receipt contract and lifecycle mapping.
- Update module backlog with Route 150 closeout and next route recommendation.
- Adjust tests only for receipt projection shape when current behavior remains unchanged.

## Explicit Non-Goals

Do not:

- add shell commands, broaden allowlists, or change sandbox decisions
- change Rust protocol behavior or move TS control-plane semantics into Rust
- expand browser runtime behavior, public web, screenshots/OCR, or action scope
- expand edit/patch execution or workspace write authority
- change provider/model behavior or run live provider gates
- change CLI behavior, session schema, transcript format, or package dependencies
- replace resultMapper truthfulness classification
- hide failures behind skips

## Boundaries

Hard boundaries:

- No package/dependency changes.
- No default gate changes.
- No provider/auth core changes.
- No real-provider execution.
- No external MCP server execution.
- No broad mutation capability.
- No broad runtime/daemon rewrite.

Capability-specific boundaries:

- Workspace boundary: receipt may report workspace authority facts; it must not decide authority.
- Permission boundary: receipt may include policy outcome; it must not approve or deny.
- Runtime boundary: receipt summarizes existing execution, timeout, cancel, cleanup, and environment facts.
- Session/continue boundary: receipt summaries must be replay-safe and redacted.
- Result-surface boundary: receipt feeds result projection; it does not replace terminal truthfulness.
- Harness/eval boundary: tests assert receipt shape and existing package green baseline.
- Redaction boundary: no raw DOM, raw file dumps, unbudgeted stdout/stderr, cookies, tokens, private keys, auth headers, or provider config paths.

## Capability Contract

| Stage | Current State | Route Change | Evidence Required |
|---|---|---|---|
| availability | command/browser/runtime readiness facts are capability-local | define receipt availability fields | focused receipt tests |
| policy | policy states use Route 146 vocabulary | include policy snapshot without deciding policy | policy blocked tests |
| planning | runtime receipt not involved | no planning change | no planning behavior diff |
| execution | command/browser/sandbox outcomes are capability-local | normalize execution status fields | command/browser receipt tests |
| observation | stdout/stderr/browser observations are local | add budgeted observation summaries | redaction tests |
| evidence | evidence lines vary by capability | add replay-safe receipt evidence projection | projection tests |
| result mapping | resultMapper remains truthfulness owner | feed safe receipt summaries into existing projection paths | result-contract gate |
| transcript | session receives capability-specific summaries | provide transcript-safe runtime receipt summary | session/replay tests if touched |
| continue / replay | continuation consumes safe evidence | receipt summary can be selected as safe evidence | continuation tests if touched |
| eval | package baseline is green | preserve green baseline | runMvp/package sweep |
| report | runtime report vocabulary varies | document and project receipt report fields | doc + helper tests |
| cleanup | browser/daemon/command cleanup facts differ | normalize cleanup status | cleanup receipt tests |
| redaction | redaction is capability-specific | central redaction rules for runtime receipt projection | redaction tests |

## Implementation Tasks

### 1. Runtime receipt audit

Create `docs/architecture/runtime-receipt-contract.md`.

Map current receipt-like facts for:

- local shell command
- sandbox preflight / process spawn
- daemon/runtime context
- browser runtime status
- browser transaction cleanup
- MCP process/protocol runtime errors where relevant
- timeout/cancel/error paths
- package/harness reports

Record:

- current owner
- current fields
- current result/status vocabulary
- redaction rules
- candidate integration points
- unsafe areas

### 2. Define shared receipt type

Add `runtimeReceipt.ts`.

The receipt should support:

- `receiptId`
- `runtimeKind`: `local-command`, `sandbox`, `daemon`, `browser`, `mcp-process`, `unknown`
- `availability`
- `policy`
- `execution`
- `result`
- `reasonCode`
- `doNext`
- `targetSummary`
- `commandSummary`
- `exitCode`
- `signal`
- `durationMs`
- `timeoutMs`
- `cleanup`
- `redaction`
- `evidence`
- `transcriptSafeSummary`

Use the Route 146 vocabulary where possible.

Do not require every runtime path to populate every field.

### 3. Define projection and redaction helpers

Add `runtimeReceiptProjection.ts`.

It should provide:

- safe summary projection
- transcript-safe projection
- terminal-facing summary projection
- cleanup summary projection
- timeout/cancel summary projection
- stdout/stderr budgeted summary projection
- browser raw-content exclusion projection
- secret/path redaction

The projection must be pure.

### 4. Integrate high-value paths

Integrate only safe call sites.

Preferred first integrations:

- command success/failure in tool runtime path
- sandbox denied/escalation preflight summary
- browser runtime unavailable / cleanup summary
- browser transaction timeout/cleanup receipt if already clean
- MCP process/protocol runtime failure projection if it currently duplicates fields
- result/session summary consumer if it can preserve behavior exactly

Do not touch every call site.

### 5. Preserve result semantics

For every integration:

- completed remains completed
- stopped remains stopped
- failed remains failed
- existing reason codes remain stable or explicitly mapped
- do-next remains actionable
- resultMapper classification remains unchanged
- transcript summaries remain redacted

### 6. Tests

Add focused tests for:

- command success receipt
- command failure receipt
- command timeout receipt if existing fixture supports it
- sandbox policy blocked/escalation receipt
- runtime unavailable receipt
- browser runtime unavailable receipt
- browser cleanup succeeded/failed receipt
- MCP process/protocol runtime failure receipt if integrated
- transcript-safe projection excludes secrets/raw DOM/raw file dumps
- stdout/stderr summaries are budgeted
- receipt result maps into Route 146 result vocabulary

### 7. Baseline validation

Run:

- focused runtime receipt tests
- focused touched tool/runtime/sandbox/browser/MCP tests
- runMvpIntegratedFlow.test.ts
- package sweep if feasible
- verify:edit-capability-closeout
- verify:result-contract
- build
- diff check
- git status

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/core/runtime/runtimeReceipt.test.ts src/core/runtime/runtimeReceiptProjection.test.ts`
- focused tests for touched runtime/tool/sandbox/browser/MCP files

Broader validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
- `rtk npm run test -w packages/ts-shell` if feasible
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`

Repository hygiene:

- `rtk git diff --check`
- `rtk git status --short --branch`
- `rtk git diff --name-only -- packages/ts-shell/src`
- `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

## Required Evidence Markers

If the route adds or changes a verifier, define stable markers.

This route should not add a new verifier by default.

If it does:

- success marker: `runtime-receipt:pass`
- failure marker: `runtime-receipt:fail`
- skip marker: `runtime-receipt:skip`
- redaction marker: `runtime-receipt:redacted`
- real-provider opt-in marker: not applicable
- external MCP marker: not applicable
- dirty-repo marker: existing verifier behavior only

## Completion Audit

Before final response, map every requested deliverable to evidence:

| Requirement | Evidence | Status |
|---|---|---|
| runtime receipt type | `runtimeReceipt.ts` | |
| projection/redaction helper | `runtimeReceiptProjection.ts` | |
| docs | `runtime-receipt-contract.md` | |
| focused tests | receipt tests | |
| high-value integration | touched call sites | |
| package baseline preserved | validation output | |
| no boundary expansion | source/package diff and final report | |

## Final Report Format

1. Branch and base commit
2. Files changed
3. What changed
4. Runtime path or blocker advanced
5. Validation commands and results
6. Real-provider gate status, if applicable
7. External MCP status, if applicable
8. Audit/history residue handling
9. Source/package change confirmation
10. Remaining risks
11. Best next action
12. Proposed commit message

Do not commit or push.
