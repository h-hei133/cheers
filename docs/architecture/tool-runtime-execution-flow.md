# Tool Runtime Execution Flow

Route: `docs/agent-routes/route165-tool-runtime-execution-flow.md`

## Scope

Route 165 calibrates the existing Tool / Runtime command execution flow across
runtime receipt metadata, tool lifecycle projection, Result Surface
truthfulness, session terminal rendering, transcript-safe evidence, and focused
gate evidence.

This route does not add shell commands, broaden allowlists, change sandbox or
approval decisions, alter runtime execution semantics, change Result Surface
truthfulness, modify session schema, change CLI behavior, add dependencies, or
change package scripts.

## Ownership

- Tool owns dispatch lifecycle and approval/unavailable/failure facts through
  `toolRuntimeModule.ts`, `flowDispatch.ts`, `toolLifecycleProjection.ts`, and
  `toolExecutionOutcomeProjection.ts`.
- Runtime owns command receipts and safe receipt projection through
  `runtimeReceipt.ts` and `runtimeReceiptProjection.ts`.
- Result Surface owns terminal truthfulness through `resultMapper.ts`,
  `capabilityResultClassification.ts`, and `actionableBlockerModule.ts`.
- Session / Continue consumes the mapped terminal result through
  `sessionTerminalState.ts`; it does not decide command truthfulness.
- Harness / Eval consumes stable evidence markers; it does not define product
  runtime behavior.

## Calibrated Flow

```text
ToolRuntime executes existing bash/tool path
  -> metadata.runtimeReceipt contains budgeted Runtime projection
  -> dispatchToolWithLifecycle projects tool lifecycle/provenance
  -> run-command and verify paths add runtime receipt evidence markers
  -> resultMapper preserves completed/stopped/error truthfulness
  -> sessionTerminalState renders terminal and action result summaries
```

The new evidence bridge is `projectRuntimeReceiptEvidence()` in
`flowDispatch.ts`. It consumes only the already projected
`metadata.runtimeReceipt` object and emits stable, budgeted markers:

- `runtime-receipt-result:*`
- `runtime-receipt-transcript:*`
- `runtime-receipt-cleanup:*`
- `runtime-receipt-timeout:*`
- `runtime-receipt-stdout:*`
- `runtime-receipt-stderr:*`
- `runtime-receipt-redaction:*`
- `runtime-receipt-evidence:*`

The bridge does not execute commands or reinterpret terminal status. It only
preserves receipt evidence that Runtime already sanitized and budgeted.

## Outcome Map

| Outcome | Runtime receipt | Tool / verification result | Result Surface | Session terminal |
|---|---|---|---|---|
| command success | `execution=succeeded`, `result=completed`, stdout summary optional | verification/run-command remains passed/completed | remains `completed` when task evidence is satisfied | success, no blocker detail |
| nonzero command failure | `execution=failed`, `result=failed`, exit code/stderr summary | verification failed unless an existing blocker classifier applies | approved hard command failures remain terminal error | error, command failed files/next action |
| timeout/cancel | `execution=timed-out` or `cancelled`, `result=failed`, timeout summary | existing classifier treats timeout/cancel as environment-not-ready where verification fixtures use metadata | never maps to completed by receipt alone | stopped/error according to Result Surface input |
| blocked allowlist | sandbox/runtime receipt stopped before execution | actionable `command-not-allowlisted` evidence remains stopped | `stopped_error` with stopped classification | blocker detail from shared Result Surface vocabulary |
| approval denied | sandbox policy receipt stopped before execution | verification blocker `approval-denied` remains resume-eligible | `stopped_error` with stopped classification | blocker detail and do-next rendered |
| runtime unavailable | existing daemon/MCP/browser unavailable receipts remain stopped or failed local facts | unavailable paths stay capability-owned | actionable unavailable markers stop only when current Result Surface recognizes them | no success claim |

## Safety Rules

- Runtime receipt stdout/stderr evidence is taken from
  `runtimeReceiptProjection.ts`, which budgets and sanitizes output.
- Evidence markers must not include raw DOM, raw HTML, provider config paths,
  secrets, bearer tokens, API keys, cookies, authorization headers, private
  keys, or long raw dumps.
- Runtime receipts remain evidence. `resultMapper.ts` remains the final
  terminal truthfulness owner.

## Validation Surface

Focused Route 165 coverage:

- `flowDispatch.test.ts`: command dispatch lifecycle, approval denial,
  stopped summary redaction, runtime receipt evidence marker projection, and
  run-command success without mutation synthesis.
- `verificationPlanner.test.ts`: command verification success/failure, blocked
  evidence, and budgeted runtime receipt evidence for verify results.
- `runtimeReceipt.test.ts`: success, failure, timeout, sandbox blocked,
  browser unavailable, and MCP failure receipt vocabulary.
- `runtimeReceiptProjection.test.ts`: stdout/stderr budgeting, timeout,
  cleanup, raw-content exclusion, and secret/private-provider redaction.
- `toolLifecycleProjection.test.ts`: success, approval denied, unavailable,
  MCP failure classes, and generic execution failure classification.
- `resultMapperBoundary.test.ts`: command success stays completed, approved
  hard command failures stay error, actionable blocked paths stay stopped.
- `sessionRuntimeBoundary.test.ts` and `sessionRuntime.test.ts`: terminal
  blocker rendering, approval-denied display, approved command failure display,
  and compact execution summaries.

## Preserved Boundaries

Preserved:

- command allowlist and sandbox/approval decisions
- runtime execution order and timeout behavior
- terminal completed/stopped/error truthfulness
- session metadata/state/transcript schemas
- CLI flags and output modes
- provider/browser/edit scope
- package scripts and dependencies

Not run by this route:

- provider live gates
- external MCP execution
- browser expansion gates
- edit capability closeout, because edit/workspace files were not touched
