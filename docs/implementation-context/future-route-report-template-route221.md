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
