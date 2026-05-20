# Foundation Risk Register

Route: `docs/agent-routes/route163-foundation-consistency-audit.md`

## Blocking

None found in this audit. Terminal truthfulness, no-write edit preconditions,
runtime redaction, provider readiness redaction, and verifier dry-run safety all
have focused evidence.

## High

### Session terminal blocker detail marker parity

- Affected modules: Result Surface, Session / Continue, CLI / UX.
- Why it is a contradiction: `resultMapper` and `actionableBlockerModule`
  recognize Route 162 provider/browser/edit markers, but
  `sessionTerminalState` keeps a narrower duplicate classifier for terminal
  blocker detail rendering.
- Evidence: `actionableBlockerModule.ts`, `sessionTerminalState.ts`,
  `crossCapabilityResultFlow.test.ts`.
- Recommended next action: add a focused Result Surface / Session terminal
  surface route that shares or aligns blocker detail projection without
  changing terminal truthfulness or session schema.
- Should become a route: yes.

## Medium

### Harness gate taxonomy remains uneven

- Affected modules: Harness / Eval, Result Surface, Provider / Model.
- Why it is not a contradiction: current verifier facades preserve flags,
  report fields, dry-run facts, and redaction; the missing piece is a shared
  taxonomy across gate families.
- Evidence: `verifierModuleBoundary.test.mjs`, `verifier-module-extraction.md`,
  `module-backlog.md`.
- Recommended next action: run the already listed `Harness / gate taxonomy`
  route before expanding release/report claims.
- Should become a route: yes.

### Browser cleanup has layered local failure vs terminal stopped semantics

- Affected modules: Browser, Runtime, Result Surface, Session / Continue.
- Why it is not a contradiction: browser transaction cleanup failure is a
  capability-local failed result, while Result Surface can treat the same safe
  marker as an actionable stopped terminal result.
- Evidence: `browserTxn.ts`, `browserTxn.test.ts`,
  `crossCapabilityResultFlow.test.ts`.
- Recommended next action: keep the distinction documented; add terminal
  surface marker parity before changing browser behavior.
- Should become a route: no, unless terminal output parity is routed.

### Provider readiness diagnostic failure classification is intentionally mixed

- Affected modules: Provider / Model, Result Surface, CLI / UX.
- Why it is not a contradiction: missing config/key and opt-in are actionable
  stopped states; auth/unknown diagnostic failures can remain hard errors.
- Evidence: `providerReadinessCliSurface.test.ts`,
  `crossCapabilityResultFlow.test.ts`.
- Recommended next action: keep provider live/config boundaries closed; only
  revisit if a provider readiness parity route is selected.
- Should become a route: no by itself.

## Low

### Implementation context is documentation, not import policing

- Affected modules: Capability Contract Architecture, all capability owners.
- Why it is not a contradiction: the implementation context intentionally names
  owner modules and facades without enforcing import rules.
- Evidence: `docs/implementation-context/README.md` and manifest scope.
- Recommended next action: future routes should keep using it as route-start
  context and update it only when code ownership changes.
- Should become a route: no.

## Accepted

### Runtime receipts do not decide terminal truthfulness

- Affected modules: Runtime, Tool, Browser, MCP, Result Surface.
- Why accepted: runtime receipts are transcript-safe evidence and local status
  projections; `resultMapper.ts` remains the terminal truthfulness owner.
- Evidence: `runtime-receipt-contract.md`,
  `runtimeReceiptProjection.test.ts`, `resultMapper.ts`.
- Recommended next action: preserve this layering in future receipt-consumer
  routes.
- Should become a route: no.

### Verifier reports are evidence, not product behavior

- Affected modules: Harness / Eval, Result Surface.
- Why accepted: reports assert markers, redaction, and gate outcomes but do not
  authorize provider, browser, edit, session, CLI, or runtime behavior.
- Evidence: `verifierModuleBoundary.test.mjs`,
  `capability-flow-graph.md`.
- Recommended next action: keep report/schema work separate from runtime
  behavior changes.
- Should become a route: no.
