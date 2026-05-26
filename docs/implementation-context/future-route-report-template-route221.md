# Route221 Future Route Report Template

Status: future-route protocol.

Future capability routes should copy this structure into their final report or
durable route artifact. The goal is to make route status derive from evidence,
not from route-local benchmark convenience.

## Route Summary

- Route:
- Objective:
- Runtime path or blocker advanced:
- Final status: `COMPLETE` / `PARTIAL` / `BLOCKED`
- Independent audit result:
- If audit returned `PARTIAL`, rerun audit result:
- Final status if no independent `PASS` rerun after `PARTIAL`: `PARTIAL`

## Frozen Tasks Attempted

| Frozen task id | Required claim | Evidence level | Product path consumer | Negative controls | Verdict |
|---|---|---|---|---|---|
| `<id>` | `<claim>` | `<level>` | `<module/gate/result surface>` | `<passed/failed>` | `<COMPLETE/PARTIAL/BLOCKED>` |

## Route-Local Tasks Added

| Route-local task id | Purpose | Why it is secondary | Evidence level | Regression protected |
|---|---|---|---|---|
| `<id>` | `<purpose>` | Route-local evidence cannot be primary COMPLETE evidence. | `route-local-benchmark` | `<behavior>` |

## Task Verdicts

| Task id | Context | Provider/proposal | Exact-ready/anchor | Confirmation | Apply | Verification | Repair | Session/result evidence | Final verdict | Not-proven claims |
|---|---|---|---|---|---|---|---|---|---|---|
| `<id>` | `<origin/product path>` | `<fake/live/not-called>` | `<ready/not-ready>` | `<explicit/missing>` | `<applied/not-run>` | `<passed/failed/missing>` | `<proposal/apply/reverify>` | `<terminal truth>` | `<verdict>` | `<claims>` |

## Evidence Classification

- Product evidence:
- Frozen task evidence:
- Selected workspace evidence:
- Live provider evidence:
- Benchmark evidence:
- Route-local evidence:
- Focused/fake evidence:
- Not-proven claims:

## Evidence Provenance

Frozen task id reference is not proof that the frozen task definition was loaded.
Route reports must record where their primary evidence came from. Helper-only composition cannot be product-proven.
A hardcoded route-local repair proposal cannot prove frozen repair-to-success.
A harness boolean cannot prove product confirmation.

Required primary evidence fields:

| Field | Allowed values or shape | Meaning |
|---|---|---|
| `source` | `frozen-task-product-path`, `product-proven`, `selected-workspace-product-path`, `live-provider-product-path`, `route-local-benchmark`, `focused-only`, `not-proven` | The source class for the primary claim. `route-local-benchmark` and `focused-only` cannot support `COMPLETE`. |
| `frozenTaskLoadedFromFile` | boolean | Whether the primary task was loaded from `docs/implementation-context/frozen-capability-tasks-route221.json`. |
| `frozenTaskId` | known frozen task id or `null` | The frozen task used as the primary driver. A matching id string alone is insufficient. |
| `executionEntrypoint` | `product-runtime`, `product-composition-root`, `route-gate`, `helper-composition`, `route-local-script-only` | The entrypoint that consumed the task. Product-proven evidence cannot be `route-local-script-only` or helper-only. |
| `productConsumer` | module/function string or `null` | Product module, composition root, result surface, or route gate that consumed the task. Required when route-local harness evidence is also present. |
| `routeLocalHarnessUsed` | boolean | Whether a same-route harness contributed evidence. If true, `COMPLETE` still needs separate frozen/product evidence. |
| `helperOnlyComposition` | boolean | Whether evidence was assembled only from lower-level helpers. Must be false for product-proven `COMPLETE`. |
| `proposalSource` | `live-provider`, `deterministic-from-product-read-evidence`, `deterministic-from-failure-evidence`, `route-local-hardcoded`, `fake-focused`, `not-applicable` | Repair proposal origin. `route-local-hardcoded` and `fake-focused` cannot prove frozen repair-to-success. |
| `confirmationSource` | `product-approval`, `explicit-authority-contract`, `harness-boolean`, `none` | Authority source for apply/repair. `harness-boolean` cannot prove product confirmation. |
| `verificationSource` | `task-relevant-command`, `product-verification-route`, `runtime-readback`, `fixture-readback-only`, `marker-only`, `not-run` | Post-action verification source. `fixture-readback-only`, `marker-only`, and `not-run` cannot prove frozen repair-to-success. |

Per-task verdicts may include a narrower `primaryEvidence` override when a
route has more than one independent evidence source. The route-level
`primaryEvidence` still governs the final route status.

## Required Negative Controls

- Route-local benchmark-only COMPLETE rejected:
- Fake/focused labeled live rejected:
- Repair continuation labeled repair success rejected:
- Apply without verification rejected:
- Command-only bypass rejected:
- Audit `PARTIAL` override rejected unless independent rerun returned `PASS`:

## Machine-Checkable Report Artifact

Future capability routes should also keep a small JSON report artifact that can
be checked by `npm run verify:route221-anti-false-success-gate -- --report
<path>`. The JSON artifact is intentionally static and should summarize the
same facts as the human report.

Required shape:

```json
{
  "schemaVersion": 1,
  "route": "route222",
  "routeType": "capability",
  "finalStatus": "PARTIAL",
  "independentAuditResult": "PARTIAL",
  "independentPassRerun": null,
  "primaryEvidence": {
    "source": "not-proven",
    "frozenTaskLoadedFromFile": true,
    "frozenTaskId": "frozen-upper-bound-challenge-verification-failure-repair-case",
    "frozenTaskPromptHash": "sha256-or-stable-fingerprint",
    "executionEntrypoint": "helper-composition",
    "productConsumer": null,
    "routeLocalHarnessUsed": true,
    "helperOnlyComposition": true,
    "proposalSource": "route-local-hardcoded",
    "confirmationSource": "harness-boolean",
    "verificationSource": "fixture-readback-only"
  },
  "frozenTasksAttempted": [
    {
      "id": "frozen-upper-bound-challenge-verification-failure-repair-case",
      "requiredClaim": "repair-to-success",
      "evidenceLevel": "partial",
      "primaryCompleteEvidence": false,
      "negativeControls": ["repair continuation rejected as success"],
      "verdict": "PARTIAL"
    }
  ],
  "routeLocalTasksAdded": [
    {
      "id": "route222-focused-regression",
      "secondary": true,
      "evidenceLevel": "route-local-benchmark",
      "primaryCompleteEvidence": false
    }
  ],
  "requiredNegativeControls": {
    "routeLocalBenchmarkOnlyCompleteRejected": true,
    "fakeFocusedLabeledLiveRejected": true,
    "repairContinuationLabeledRepairSuccessRejected": true,
    "applyWithoutVerificationRejected": true,
    "commandOnlyBypassRejected": true,
    "auditPartialOverrideRejected": true
  },
  "taskVerdicts": [
    {
      "taskId": "frozen-upper-bound-challenge-verification-failure-repair-case",
      "evidenceLevel": "partial",
      "providerEvidenceClass": "fake/focused-only",
      "providerMode": "fake",
      "repair": {
        "continuationCreated": true,
        "proposalCreated": true,
        "applied": false,
        "postRepairVerification": "not-run",
        "reportedRepairSuccess": false
      },
      "apply": {
        "status": "not-run",
        "verificationStatus": "not-run",
        "reportedSuccess": false
      },
      "finalVerdict": "PARTIAL"
    }
  ]
}
```

Machine-checkable report rules:

- Every frozen task id must exist in
  `docs/implementation-context/frozen-capability-tasks-route221.json`.
- `COMPLETE` capability reports must include `primaryEvidence`.
- If a frozen task is primary `COMPLETE` evidence, `primaryEvidence` must show
  `frozenTaskLoadedFromFile: true` and a known `frozenTaskId`.
- Product-proven `COMPLETE` evidence cannot use
  `executionEntrypoint: "route-local-script-only"` or helper-only composition.
- Frozen repair-to-success `COMPLETE` cannot use a hardcoded/fake proposal,
  harness-boolean confirmation, fixture-readback-only verification,
  marker-only verification, or no verification.
- If `routeLocalHarnessUsed` is true, `COMPLETE` still requires separate
  primary frozen/product evidence.
- `primaryEvidence.source: "route-local-benchmark"` cannot support
  `COMPLETE`.
- Every evidence level must be defined by
  `docs/implementation-context/capability-evidence-schema-route221.md`.
- Capability reports must include `requiredNegativeControls`.
- Route-local tasks must set `secondary: true`, use
  `route-local-benchmark`, and set `primaryCompleteEvidence: false`.
- If `independentAuditResult` is `PARTIAL`, a `COMPLETE` final status requires
  `independentPassRerun.result: "PASS"`.
- Fake or focused provider evidence must not use `live-provider-proven`.
- Repair continuation or proposal alone must not set
  `reportedRepairSuccess: true`.
- Apply without passed verification must not set `reportedSuccess: true`.

## Reference Adoption

Use `docs/implementation-context/reference-adoption-template-route221.md`.

| Capability area | Reference repo | File or subsystem inspected | Pattern adopted | Local seam changed | Pattern rejected | Reason | Evidence produced |
|---|---|---|---|---|---|---|---|
| `<area>` | `<repo or not-inspected>` | `<targeted path>` | `<pattern>` | `<local seam>` | `<rejected>` | `<reason>` | `<evidence>` |

## Validation

| Command | Result | Notes |
|---|---|---|
| `npm run verify:route221-anti-false-success-gate` | `<pass/fail/not-run>` | Required for routes using this harness. |
| `<focused gate>` | `<pass/fail/not-run>` | Tied to changed runtime path. |
| `npm run verify:result-contract` | `<pass/fail/not-run>` | Required when result/session truthfulness is touched. |
| `npm run build -w packages/ts-shell` | `<pass/fail/not-run>` | Required when TypeScript code changes. |
| `git diff --check` | `<pass/fail/not-run>` | Required before commit. |

## Final Audit

- Does this prevent route-local benchmark-only `COMPLETE`?
- Does this prevent demo/export/focused-only `COMPLETE`?
- Does this require negative controls?
- Does this preserve innovation as task verdicts rather than runtime bloat?
- Is it lightweight enough not to block future development?
- Remaining risks:
- Recommended next route:
