# Tool Policy Result Contract

Route: `docs/agent-routes/route146-tool-policy-result-contract.md`

## Scope

Route 146 defines a shared Tool / Policy / Result vocabulary and wires it into
high-value duplicate construction points without changing capability decisions,
terminal truthfulness, provider behavior, browser behavior, edit behavior,
CLI/schema/dependencies, or the broad tool registry/runMvp shape.

This route is a seam route:

- `packages/ts-shell/src/core/tools/toolPolicyResult.ts` owns the shared
  lifecycle receipt vocabulary.
- `packages/ts-shell/src/core/tools/toolResultProjection.ts` owns replay-safe
  tool result summaries and redaction.
- Existing tool, MCP, browser, approval, and command projection paths consume
  the seam only where their current behavior could be preserved exactly.

## Reference Scan

Bounded reference scan was shape-only; no implementation code was copied.

- opencode keeps permission ask/reply separate from tool execution and carries
  tool output metadata through a registry wrapper.
- Claude Code exposes permission modes and hook/tool outcomes as named
  lifecycle surfaces rather than hidden prompt behavior.
- OpenHands treats action/observation events as stored, queryable, and streamed
  conversation events.
- Gemini CLI's A2A tool-call draft models pending, executing, succeeded,
  failed, and cancelled as one explicit lifecycle.

The shared lesson is that policy, execution, result, and transcript-safe
observation should be named separately even when a route keeps local execution
logic unchanged.

## Unified Vocabulary

Availability:

- `available`
- `unavailable`
- `disabled`
- `not-configured`
- `not-installed`
- `not-ready`

Policy:

- `allowed`
- `blocked`
- `requires-approval`
- `approval-denied`
- `not-applicable`

Execution:

- `not-run`
- `running`
- `succeeded`
- `failed`
- `timed-out`
- `cancelled`
- `invalid-result`

Result:

- `completed`
- `stopped`
- `failed`

The vocabulary maps current values into a shared receipt. It does not rename
externally asserted terminal reasons, verification statuses, MCP classes,
browser reason codes, edit reason codes, or session schemas.

## Current Lifecycle Map

| Path | Availability | Policy | Execution | Result | Reason / do-next source | Evidence / transcript safety |
|---|---|---|---|---|---|---|
| command allowlist block | `available` | `blocked` | `not-run` | `stopped` | `command-not-allowlisted`, existing allowlist guidance | no stdout/stderr; actionable blocker markers remain existing result/session owners |
| command success | `available` | `allowed` | `succeeded` | `completed` | successful `run-command` dispatch reason | no file mutation is synthesized; command result remains command-only |
| command failure | `available` | `allowed` | `failed` / blocked by environment | `failed` / `stopped` | `toolLifecycleProjection` and verification blocker projection | long/raw output is projected through safe summary helpers when used for replay |
| MCP unavailable | `not-configured` / `unavailable` | `not-applicable` | `not-run` | `stopped` | existing `/mcp status` and `/mcp refresh` guidance | `mcpSafeDetail` redaction remains the MCP taxonomy owner |
| MCP protocol / tool error | `available` | `allowed` | `failed` / `invalid-result` | `failed` | existing MCP failure class and do-next metadata | raw process/env dumps stay out of safe details |
| browser blocked | `available` | `blocked` | `not-run` | `stopped` | existing `policy-blocked` and browser policy next action | raw DOM/screenshots/session persistence remain excluded |
| browser unavailable | `disabled` / `not-installed` / `not-ready` | `not-applicable` | `not-run` | `stopped` | existing runtime reason code and next action | browser observation metadata keeps `rawContent: excluded` |
| edit missing target/content | `available` | `blocked` | `not-run` | `stopped` | existing edit expectation reason code and do-next | no writer invocation, no changed files |
| provider opt-in / not configured | `not-configured` | `not-applicable` | `not-run` | `stopped` | explicit opt-in and readiness scripts | real provider config paths/secrets remain redacted and never read manually |
| session-adjacent replay | `available` | `not-applicable` | `not-run` | `stopped` / `completed` according to prior terminal state | continuation evidence and recovery predicates | Route 145 replay-safety filter excludes raw DOM, raw file dumps, secrets, cookies, auth, and private keys |

## Extracted Helpers

`toolPolicyResult.ts` provides pure builders for:

- policy blocked
- unavailable / disabled / not configured / not installed / not ready
- approval denied
- execution failed / timed out / cancelled / invalid result
- completed tool result
- terminal-safe capability labels

`toolResultProjection.ts` provides:

- result summary
- evidence summary
- transcript-safe summary
- terminal-facing summary
- redaction status

The projection excludes raw DOM/HTML, cookies, auth headers, API keys, tokens,
private-key-like content, private real-provider paths, and long unbudgeted
output dumps.

## Integrated Call Sites

High-value duplicate construction points now consume the shared seam:

- `core/tools/runtime.ts`
  - command allowlist block
  - MCP unavailable / not registered
  - generic tool unavailable / not registered
- `core/tools/approvalFlow.ts`
  - approval denied result construction
- `core/tools/registry.ts`
  - MCP tool-is-error and MCP execution/protocol failure metadata
- `core/context/browserTool.ts`
  - browser policy blocked and browser runtime unavailable tool results
- `orchestration/editExpectationContract.ts`
  - edit/write stopped contracts for missing target/content and unsupported
    current edit shapes
- `core/shell/providerReadiness.ts`
  - provider unsupported, missing-key, and missing-config readiness failures
- `core/tools/toolLifecycleProjection.ts`
  - shared mapping for success, approval denied, unavailable, policy blocked,
    MCP protocol/process/tool failures, and generic execution failure
- `orchestration/flowDispatch.ts`
  - command-success receipt construction and replay-safe summary redaction

These integrations intentionally leave the dispatcher, registry contents,
browser runtime internals, edit writer policies, provider live behavior, and
session schemas unchanged.

## Preserved Semantics

Preserved:

- command allowlist remains narrow
- approval denial remains recoverable stopped behavior where existing result
  mapping classifies it that way
- MCP unavailable, MCP tool-is-error, protocol/malformed, process, and generic
  execution failure remain distinct
- browser policy blocked and browser unavailable remain distinct
- edit missing target/content remains stopped/no-write
- provider real path remains opt-in only and was not invoked
- transcript-safe summaries do not include raw browser/page content or secrets
- no dependency, CLI, schema, or broad runMvp rewrite

Not changed:

- terminal reason strings such as `completed` and `stopped_error`
- `metadata.json`, `state.json`, or `transcript.jsonl`
- write authorization, stale-read, or workspace authority behavior
- public browser, edit, or provider capability scope

## Remaining Risks

- Some result construction still lives in capability-specific modules. That is
  deliberate; moving every caller would become a broad tool-registry or
  runMvp rewrite.
- `resultMapper.ts` still owns terminal truthfulness. The new seam feeds safe
  receipts and summaries; it does not replace terminal classification.
- Provider readiness parity remains script-oriented and should be handled by a
  dedicated route if provider readiness reporting becomes the next blocker.

## Route 147 Recommendation

Proceed with Future Edit Expansion Contract Map only as a contract/planning
route. The best next implementation value is to define explicit contracts for
broad refactor planning, multi-file discovery edit, and broader fenced
replacement support without enabling new write behavior.

## Post-Route-149 Forward Pointer

Route 149 makes this contract a shared input for future module routes. New
runtime, workspace, edit, browser, provider, and CLI work should reuse the
availability/policy/execution/result vocabulary instead of inventing
capability-local success or stopped states.

The contract remains a projection surface. It does not authorize writes,
provider calls, browser execution, schema changes, CLI behavior changes, or
default gate changes.
