# Route221 Capability Evidence Schema

Status: frozen development harness schema.

This schema defines the evidence labels and task verdict fields future
capability routes must use when claiming `COMPLETE`, `PARTIAL`, or `BLOCKED`.
It is intentionally a reporting and audit schema, not a runtime protocol.

## Evidence Levels

| Level | Meaning | Can be primary COMPLETE evidence? |
|---|---|---|
| `product-proven` | Current product path, result/session surface, and relevant verification prove the claim. | Yes, when negative controls pass. |
| `live-provider-proven` | Explicit opt-in live provider gate ran through approved paths with isolated homes, redaction, and attribution. | Yes, only for live-provider claims. |
| `selected-workspace-proven` | Explicit selected-workspace authority, apply/readback, and verification prove the mutation claim. | Yes, for selected-workspace claims. |
| `frozen-task-proven` | A Route221 frozen task or later frozen task pack passed without being weakened by the same route. | Yes, when paired with product or selected-workspace evidence where required. |
| `benchmark-proven` | A benchmark proves a controlled shape. | Secondary unless the route objective is only benchmark coverage. |
| `route-local-benchmark` | A benchmark, fixture, or task introduced by the same route. | No. Regression evidence only. |
| `focused-only` | A focused unit/integration slice proves a narrow internal behavior. | No by itself. |
| `fake/focused-only` | Fake provider or synthetic fixture evidence proves only the fake/focused path. | No for live or product claims. |
| `deterministic-only` | Deterministic harness evidence proves a fixed synthetic path. | No by itself. |
| `review-only` | Proposal, review, or confirmation surface exists without completed apply/verification. | No. |
| `partial` | Some required evidence exists, but at least one required capability field is missing or weak. | No. |
| `blocked` | The task cannot proceed under current route constraints or requires a separate route. | No. |
| `not-proven` | No adequate evidence for the claim. | No. |

## Task Verdict Fields

Every future task verdict should include these fields. If a field is not
relevant, set it to `not-applicable` with a reason.

| Field | Required content |
|---|---|
| `context` | Route id, task id, origin (`frozen` or `route-local`), product path, allowed file/module area. |
| `providerProposal` | Provider mode, whether provider was called, fake/live classification, proposal source, and redaction status. |
| `exactReadyAnchor` | Exact hunk readiness, stale-read status, anchor/readback basis, and unsupported edit operations. |
| `confirmation` | Whether explicit user or harness confirmation exists; prompt text alone is not authority. |
| `apply` | Apply status, writer path, selected-workspace authority, files touched, and readback status. |
| `verification` | Task-relevant command/readback/test evidence, dispatch status, exit status, and relation to changed files. |
| `repair` | Original failure, repair proposal, confirmation, repair apply, and post-repair verification as separate fields. |
| `sessionResultEvidence` | Terminal classification, stopped/error/success reason, continuation evidence, and not-proven claims. |
| `finalVerdict` | `COMPLETE`, `PARTIAL`, or `BLOCKED`, derived from the weakest required field. |
| `notProvenClaims` | Explicit claims that remain unsupported and must not be advertised as complete. |

## Required Verdict Rules

- Apply without verification is not success.
- Verification failure is not success.
- Repair continuation is not repair success.
- Repair proposal is not repair applied.
- Route-local benchmark is not product-proven.
- Fake/focused is never live.
- Default-safe is not completed work.
- Final status follows the weakest required frozen-task capability.
- A route-local benchmark may protect regressions but cannot be primary `COMPLETE` evidence.
- Audit `PARTIAL` cannot be overridden unless an independent rerun returns `PASS`.

## Primary Evidence Provenance

Future route reports use `primaryEvidence` to make source claims
machine-checkable. A frozen task id reference alone is not proof that the
frozen task was loaded from the frozen task pack and consumed by a product path.
When a report claims product or frozen `COMPLETE`, it must distinguish product
runtime/composition/root evidence from helper-only or route-local-script
evidence, repair proposals derived from failure evidence from hardcoded route
text, product authority from harness booleans, and task-relevant verification
from fixture readback or markers.

## Status Derivation

Use this order when deriving route status:

1. If any required frozen task fails a negative control, status is `PARTIAL` or
   `BLOCKED`, never `COMPLETE`.
2. If all required frozen tasks pass but only route-local benchmarks prove the
   new claim, status is `PARTIAL`.
3. If provider evidence is fake, default-safe, skipped, or focused, live
   provider claims are `not-proven`.
4. If repair evidence stops at continuation or proposal, repair-to-success is
   `partial` or `not-proven`.
5. If an audit returns `PARTIAL`, final route status remains `PARTIAL` unless an
   independent rerun returns `PASS` and is recorded.
