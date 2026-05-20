# Foundation Consistency Audit

Route: `docs/agent-routes/route163-foundation-consistency-audit.md`

## Summary

The foundation is mostly self-consistent after the central-file extraction pass
and Route 162 result-flow calibration. The clearest remaining contradiction is
that terminal truthfulness now recognizes provider/browser/edit actionable
markers that the session terminal detail renderer does not yet display as
blocker details.

No source changes were made in this audit because the fix would change the
session/CLI output surface, which Route 163 keeps closed. The contradiction is
recorded for a focused Result Surface / Session terminal surface route.

## Source Of Truth Map

| Area | Source of truth | Main consumers | Audit result |
|---|---|---|---|
| Result truthfulness | `packages/ts-shell/src/core/query/resultMapper.ts` plus `actionableBlockerModule.ts`, `terminalClassificationProjection.ts`, and `capabilityResultClassification.ts` | session runtime, CLI terminal surface, verifier gates | Consistent for terminal classification; session blocker detail display lags new markers. |
| Runtime receipts | `packages/ts-shell/src/core/runtime/runtimeReceipt.ts` and `runtimeReceiptProjection.ts` | tool/browser/MCP projections, transcript-safe summaries | Consistent as receipt evidence, not terminal authority. |
| Workspace/edit preconditions | `workspaceFileContract.ts`, `workspaceTargetProjection.ts`, `editPatchModule.ts`, `editPatchResult.ts`, and `patchResult/*` write lanes | agent loop, result mapper, session/continue, edit closeout gate | Consistent for no-write stopped preconditions. |
| Browser cleanup/result facts | `browserTxn.ts`, browser runtime/receipt surfaces, and browser harness reports | Result Surface, session-safe summaries, browser gates | Consistent with an accepted layered distinction: browser transaction may be local `failed`, terminal mapping may be actionable `stopped`. |
| Provider readiness | `providerReadiness.ts`, `providerReadinessCliSurface.ts`, provider outcome projection, and Result Surface marker parsing | CLI readiness, agent loop provider handoff, result mapper, verifier | Consistent for readiness preconditions and diagnostic failures; real-provider config remains opt-in and unread by this route. |
| Session/continue | `sessionRuntime.ts`, `sessionTerminalState.ts`, `SessionManager.ts`, `sessionFutureTurnProjection.ts`, `sessionResumeContextBuilder.ts`, durable status projection | CLI, future turns, `/continue`, transcript/replay | Consistent for terminal carryover; blocker detail display needs marker parity. |
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

## Contradiction Found

`actionableBlockerModule.ts` recognizes Route 162 markers including
`browser-cleanup-failed`, `patch-content-missing`, `unsupported-future-edit`,
`provider-not-configured`, `provider-opt-in-required`, and
`provider-unsupported`. `sessionTerminalState.ts` has a separate terminal
detail blocker classifier that still only recognizes the older subset
(`ambiguous-target`, patch generation/target/stale/partial/verification,
command, MCP, and approval).

Impact: terminal status remains truthful because `resultMapper.ts` owns final
classification, but the session terminal result block may omit blocker kind and
do-next detail for newly calibrated provider/browser/edit stopped states.

Classification: high contradiction, owner Result Surface with Session /
Continue as consumer. It should become a focused route because fixing it
changes session/CLI output text.

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
behavior changes, session schema changes, CLI behavior changes, dependency
changes, package-script changes, or global handoff abstraction were introduced.
