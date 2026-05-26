# Module Boundaries And Dependency Rules

These rules define the target direction for future restructure routes. They do
not require exact final filenames yet.

## Owner Vs Consumer

An owner module defines state, policy, receipts, and invariants for its domain.
A consumer module may request work or present results, but must not reinterpret
the owner's safety semantics.

Examples:

- Edit owns workspace authority, stale-read, apply, readback, failed files, and
  changed files.
- Provider owns credential-safe readiness and provider call receipts.
- Proposal owns exactness, anchoring, reviewability, and raw-output redaction.
- Verification owns command selection, execution status, and verification
  receipt classification.
- Repair owns repair iteration state but consumes verification evidence and
  proposal/edit facades.
- Result owns terminal classification and no-false-success projection.
- Session owns transcript/continuation persistence, not success creation.

## Public API Rules

- Every product module should expose a small public facade.
- Cross-module imports should use facades, not deep internal files.
- Tests may import internals only when they are module-local.
- Dev/evidence scripts should prefer product facades and explicitly label
  route-history bypasses.

## Dependency Direction

Preferred direction:

```text
app/cli
  -> product/turn
  -> product modules
  -> runtime/contracts/shared

product modules
  -> product/evidence
  -> product/result
  -> product/session presentation facts

dev/eval/scripts
  -> product public facades
```

The CLI can compose runtime inputs, but success truth must come from product
evidence and result projection.

## Forbidden Imports

Future checks should prevent:

- `product/*` importing `dev/*`.
- Product runtime importing `scripts/*` or `docs/implementation-context/*`.
- Provider importing edit/apply internals.
- Edit importing CLI presentation or session persistence internals.
- Session importing capability internals instead of result/evidence shapes.
- Result importing route reports or test fixtures.
- Rust importing TypeScript control-plane policy.
- Python eval importing or owning product runtime state.

## Allowed Cross-Module Contracts

Allowed contracts include:

- Capability lifecycle state.
- Runtime receipt.
- Evidence row.
- Claim evaluation input.
- Verdict.
- Terminal classification.
- Session continuation facts.
- Redaction status.
- Cleanup status.
- Workspace authority token shape.

These contracts should be stable, small, and safe for transcript/report use.

## Evidence And Receipt Flow

Every capability should emit safe evidence before any success claim:

```text
availability -> policy -> planning -> execution -> observation
  -> evidence -> claim evaluation -> verdict -> result/session/CLI
```

Skipped stages must be explicit. `not-run`, `skipped`, `blocked`, and
`not-proven` are distinct from failure and success.

## CLI, Session, Runtime, And Result Boundaries

- CLI: parse args, select mode, ask approval, bind workspace, invoke product
  turn, render output.
- Session: persist messages, state snapshots, compact summaries, approval
  memory, replay and continue facts.
- Runtime: command execution, timeout, cancellation, sandbox preflight, cleanup
  receipt.
- Result: terminal status, caveats, blockers, changed/planned/failed files,
  verification status, next action.

CLI/session may present result facts, but they must not convert partial or
unverified work into success.

## Provider, Proposal, Edit, Verification, Repair Boundaries

- Provider call success is not proposal success.
- Proposal exact-ready is not write authority.
- Write authority is not verification success.
- Verification failure is not automatic repair success.
- Repair proposal is not apply success.
- Live provider evidence is not default behavior.

Route228 proves this distinction matters: two live tasks applied and verified,
one live task was network-blocked with `applyStatus=not-run` and
`verificationStatus=not-run`.

## Tool, Browser, And MCP Boundaries

- Local deterministic MCP evidence must not claim external-live MCP readiness.
- Browser unavailable/policy-blocked evidence must not become observation
  success.
- Tool receipt success is not task success unless the claim layer evaluates it.
- Raw DOM, cookies, storage, provider output, and process/env dumps are not
  transcript-safe evidence.

## Docs And Scripts Boundary Rules

- Docs may describe architecture but must not be imported by runtime.
- Scripts may drive product facades for verification but should not become the
  only implementation of product behavior.
- Route reports are historical evidence snapshots.
- Active docs should be few and curated; route history should be quarantined.
