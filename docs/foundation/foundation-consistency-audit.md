# Foundation Consistency Audit

Route: `docs/agent-routes/route163-foundation-consistency-audit.md`

Follow-up: `docs/agent-routes/route164-session-terminal-blocker-parity.md`

## Summary

The foundation is self-consistent for the audited Result Surface/session
terminal blocker path after Route 164. Route 163 found that terminal
truthfulness recognized provider/browser/edit actionable markers that the
session terminal detail renderer did not yet display as blocker details; Route
164 aligned the session terminal renderer with the shared Result Surface
blocker vocabulary.

## Source Of Truth Map

| Area | Source of truth | Main consumers | Audit result |
|---|---|---|---|
| Result truthfulness | `packages/ts-shell/src/core/query/resultMapper.ts` plus `actionableBlockerModule.ts`, `terminalClassificationProjection.ts`, and `capabilityResultClassification.ts` | session runtime, CLI terminal surface, verifier gates | Consistent for terminal classification and blocker detail vocabulary after Route 164. |
| Runtime receipts | `packages/ts-shell/src/core/runtime/runtimeReceipt.ts` and `runtimeReceiptProjection.ts` | tool/browser/MCP projections, transcript-safe summaries | Consistent as receipt evidence, not terminal authority. |
| Workspace/edit preconditions | `workspaceFileContract.ts`, `workspaceTargetProjection.ts`, `editPatchModule.ts`, `editPatchResult.ts`, and `patchResult/*` write lanes | agent loop, result mapper, session/continue, edit closeout gate | Consistent for no-write stopped preconditions. |
| Browser cleanup/result facts | `browserTxn.ts`, browser runtime/receipt surfaces, and browser harness reports | Result Surface, session-safe summaries, browser gates | Consistent with an accepted layered distinction: browser transaction may be local `failed`, terminal mapping may be actionable `stopped`. |
| Provider readiness | `providerReadiness.ts`, `providerReadinessCliSurface.ts`, provider outcome projection, and Result Surface marker parsing | CLI readiness, agent loop provider handoff, result mapper, verifier | Consistent for readiness preconditions and diagnostic failures; real-provider config remains opt-in and unread by this route. |
| Session/continue | `sessionRuntime.ts`, `sessionTerminalState.ts`, `SessionManager.ts`, `sessionFutureTurnProjection.ts`, `sessionResumeContextBuilder.ts`, durable status projection | CLI, future turns, `/continue`, transcript/replay | Consistent for terminal carryover; blocker detail display now consumes shared Result Surface marker classification. |
| CLI surfaces | CLI facade docs and provider readiness CLI surface | startup/readiness/session display | No behavior audit found a source/code contradiction; no CLI changes made. |
| Harness/eval reports | `scripts/verify/*` facades and verifier boundary tests | route closeout, release gates | Consistent for current report/dry-run safety surfaces; shared gate taxonomy remains a planned architecture risk. |

## High-Value Evidence

- Result truthfulness: `crossCapabilityResultFlow.test.ts` covers provider
  readiness preconditions, browser cleanup redaction, edit precondition
  markers, and unknown hard failures.
- Runtime receipts: `runtimeReceiptProjection.test.ts` covers transcript-safe
  raw-content/secret redaction, stdout/stderr budgeting, timeout summaries, and
  cleanup summaries.
- Browser cleanup: `browserTxn.test.ts` covers timeout cleanup evidence,
  runtime-unavailable no-launch stop, raw DOM/secret exclusion, and cleanup
  failure evidence.
- Provider readiness: `providerReadiness.test.ts` and
  `providerReadinessCliSurface.test.ts` cover redacted readiness surfaces and
  pre-query terminal events.
- Session/continue: `sessionResumeContextBuilder.test.ts`,
  `mutationCompactContinuity.test.ts`, `SessionManager.test.ts`, and
  `sessionRuntimeBoundary.test.ts` cover stopped carryover, durable
  classification, and replay-safe summaries.
- Harness/eval: `verifierModuleBoundary.test.mjs` covers option parsing,
  suite/include-real dry-run planning, safety facts, report construction, and
  redacted unhandled failures.

## Contradiction Resolved By Route 164

`actionableBlockerModule.ts` recognizes Route 162 markers including
`browser-cleanup-failed`, `patch-content-missing`, `unsupported-future-edit`,
`provider-not-configured`, `provider-opt-in-required`, and
`provider-unsupported`. Route 164 removed the narrower local terminal detail
classifier in `sessionTerminalState.ts`; terminal blocker details now consume
the shared Result Surface classification from `actionableBlockerModule.ts`.

Impact: terminal status remains truthful because `resultMapper.ts` still owns
final classification. The session terminal result block now renders blocker
kind and do-next detail for the newly calibrated provider/browser/edit stopped
states without changing session schema or transcript format.

Classification: resolved high contradiction. Owner Result Surface with Session
/ Continue as consumer.

## Accepted Layered Distinctions

- Runtime receipt `result` is evidence, not terminal truthfulness. A command,
  browser, sandbox, or MCP receipt can say `failed` or `stopped`; the terminal
  result still comes from `resultMapper.ts`.
- Browser transaction-local `cleanup-failed` is a capability failure, while
  Result Surface may project it as an actionable terminal stop when it reaches
  coding-result evidence.
- Provider diagnostic failures such as auth or unknown readiness failures may
  remain terminal `error`; provider missing config/key and opt-in preconditions
  are actionable stopped states.
- Verifier reports assert contracts and gate evidence; they do not define
  product runtime behavior.

## Implementation Context Check

`docs/implementation-context/` matches the current code-level ownership for the
audited areas. No manifest or recipe correction was needed in this route.

## Stop Conditions Honored

No provider live calls, real-provider config reads, external MCP execution,
browser execution expansion, edit/write expansion, workspace or stale-read
behavior changes, session schema changes, dependency changes, package-script
changes, or global handoff abstraction were introduced. Route 164 changed only
terminal blocker-detail rendering text for already recognized Result Surface
blocker markers.
