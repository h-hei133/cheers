# Runtime Receipt Contract

Route: `docs/agent-routes/route150-runtime-receipt-contract.md`

## Scope

Route 150 adds a module-first Runtime Receipt contract for existing runtime
facts. It does not add command execution, browser execution, edit behavior,
provider behavior, MCP launch behavior, CLI behavior, schema changes,
dependencies, or Rust protocol changes.

The contract is a projection seam:

- `packages/ts-shell/src/core/runtime/runtimeReceipt.ts` owns the shared
  runtime receipt type and adapters.
- `packages/ts-shell/src/core/runtime/runtimeReceiptProjection.ts` owns
  transcript-safe, terminal-facing, cleanup, timeout, and budgeted observation
  summaries.
- Existing command, sandbox, browser, and MCP paths attach projected receipt
  metadata only where behavior is preserved.

`resultMapper.ts` remains the terminal truthfulness owner. Runtime receipts feed
safe summaries; they do not decide completed, stopped, or failed user-visible
classification outside their local projection.

## Vocabulary

The contract reuses Route 146 values:

- availability: `available`, `unavailable`, `disabled`, `not-configured`,
  `not-installed`, `not-ready`
- policy: `allowed`, `blocked`, `requires-approval`, `approval-denied`,
  `not-applicable`
- execution: `not-run`, `running`, `succeeded`, `failed`, `timed-out`,
  `cancelled`, `invalid-result`
- result: `completed`, `stopped`, `failed`
- redaction: `clean`, `redacted`, `failed`

Runtime-specific additions are `runtimeKind` and `cleanup`.

`runtimeKind` values:

- `local-command`
- `sandbox`
- `daemon`
- `browser`
- `mcp-process`
- `unknown`

`cleanup` values:

- `not-started`
- `not-needed`
- `succeeded`
- `failed`
- `unknown`

## Receipt Fields

The shared receipt supports:

- `receiptId`
- `runtimeKind`
- `availability`
- `policy`
- `execution`
- `result`
- `reasonCode`
- `reason`
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
- `stdoutSummary`
- `stderrSummary`
- `transcriptSafeSummary`

No runtime path is required to populate every field. The receipt records facts
already known by a capability path and leaves authority, execution, and final
terminal classification with their existing owners.

## Current Runtime Fact Map

| Runtime path | Current owner | Receipt mapping | Redaction / safety rule | Integration status |
|---|---|---|---|---|
| local command success/failure/timeout/cancel | `core/tools/registry.ts`, daemon client | `local-command`, command summary, status, exit code, stdout/stderr summaries | stdout/stderr are budgeted and sanitized in projection | integrated as metadata projection |
| Rust daemon command result/unavailable | `core/tools/registry.ts`, `daemon/client.ts` | `daemon`, command summary, status, exit code, daemon-unavailable evidence | no Rust protocol change; only TS metadata projection | integrated as metadata projection |
| sandbox policy and escalation denial | `sandbox/*`, `core/tools/approvalFlow.ts` | `sandbox`, policy state, target summary, escalation evidence | receipt reports policy facts; it does not approve or deny | integrated for denied tool results |
| browser runtime unavailable/status/cleanup | `core/context/browserTool.ts`, `pwRuntime.ts`, browser observation | `browser`, availability, reason code, cleanup status, raw content excluded | no raw DOM, screenshots, cookies, or session data | integrated as metadata projection |
| MCP unavailable/process/protocol/tool failures | `core/tools/runtime.ts`, `core/tools/registry.ts`, `core/mcp/errorTaxonomy.ts` | `mcp-process`, server/tool target, failure class/plane, invalid-result for protocol failures | safe detail comes from MCP taxonomy; projection redacts secrets/real-provider paths | integrated as metadata projection |
| browser transaction reports | `browserTxn*.ts`, browser trace/report files | existing browser-specific reports remain owners | raw page content remains excluded | not rewritten in this route |
| session/continue summaries | Session / Continue projection helpers | can consume transcript-safe receipt summaries later | no schema or transcript format change in this route | not integrated to avoid schema drift |

## Projection Rules

`runtimeReceiptProjection.ts` is pure. It provides:

- `projectRuntimeReceipt`
- `projectRuntimeTranscriptSummary`
- `projectRuntimeTerminalSummary`
- `projectRuntimeCleanup`
- `projectRuntimeTimeout`
- `budgetRuntimeObservation`
- `sanitizeRuntimeText`

Projection excludes or redacts:

- raw HTML/body/script content
- raw DOM/raw HTML labels
- `document.cookie`, `localStorage`, and `sessionStorage`
- private keys
- bearer tokens
- API keys, tokens, cookies, authorization headers, secrets, and passwords
- OpenAI/GitHub token-like values
- `/home/wang/.private-agents-real` paths
- Windows private real-provider-home paths
- long unbudgeted output dumps

Projection may shorten output below the budget when a long dump is collapsed to
`[long-output-excluded]`.

## Integrated Call Sites

High-value call sites now attach projected runtime receipts without changing
their public behavior:

- `core/tools/registry.ts`
  - local command and daemon command result metadata
  - daemon unavailable metadata
  - MCP tool-is-error, execution, and protocol failure metadata
- `core/tools/approvalFlow.ts`
  - sandbox escalation / approval-denied metadata
- `core/context/browserTool.ts`
  - browser runtime status and cleanup metadata
- `core/tools/runtime.ts`
  - command allowlist blocked metadata
  - stale or missing MCP tool metadata

The route intentionally does not rewrite every browser receipt, runMvp branch,
session projection, or tool-registry result. Wider adoption would be a separate
thin consumer route.

## Preserved Semantics

Preserved:

- command success still returns success
- command failure, timeout, and cancellation do not become completed
- sandbox denial still blocks through the existing approval flow
- command allowlist remains unchanged
- MCP failure taxonomy remains the owner of MCP safe details
- browser unavailable and cleanup facts still come from browser runtime and
  observation owners
- raw browser content and provider secrets remain excluded from summaries
- `resultMapper.ts` truthfulness is not replaced

Not changed:

- package dependencies
- CLI flags or output shape
- session schema or transcript format
- Rust protocol or daemon behavior
- browser scope or public-web behavior
- edit/write behavior
- provider/model behavior
- default gates

## Validation Gate

Focused route validation:

- `rtk npm run test -w packages/ts-shell -- src/core/runtime/runtimeReceipt.test.ts src/core/runtime/runtimeReceiptProjection.test.ts`
- touched runtime/tool/browser/MCP tests
- `runMvpIntegratedFlow.test.ts`
- package sweep when feasible
- ~~`verify:edit-capability-closeout`~~ (removed 2026-09-17)
- `verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- source/package diff checks

## Next Recommendation

The best next route is `Agent Loop receipt-consumer thin wiring` under Phase A
if runtime receipt adoption should continue. Limit it to one existing
projection handoff, keep `resultMapper.ts` truthful, and avoid broad
`runMvpIntegratedFlow.ts`, session schema, CLI, browser, edit, provider, or
Rust changes.

If coupling evidence points elsewhere, choose `Workspace / File Context
contract` instead; do not use this receipt route to justify mutation expansion.
