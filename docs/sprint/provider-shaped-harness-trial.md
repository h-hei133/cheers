# Provider Shaped Harness Trial

## Scope

This trial proves durable harness recovery from imperfect action sequences through normal QueryEngine dispatch and the execution seam. Terminal completion remains owned by evidence/result verdicts; ledger entries, restored queues, provider claims, and artifact existence alone are not terminal proof.

## Disposable Workspace Tasks

| Task | Imperfect action | Real command output | Actual write | Durable recovery | Expected verdict |
| --- | --- | --- | --- | --- | --- |
| pricing-discovery-block | Restored repair requires owner discovery, but the agent claims an edit and generic green. | `node test/pricing.mjs` fails before any accepted write. | No, wrong edit is blocked. | Restored pending repair keeps discovery/read active. | `stopped_not_proven` with wrong edit blocked. |
| invoice-targeted-rerun | First edit writes an incomplete invoice formatter and the agent reports a generic workspace green. | `node test/invoice.mjs` fails before repair and passes only after targeted rerun. | Yes, edit then repair write. | Pending verification survives the rejected generic green. | `completed` after targeted rerun. |
| manifest-repair-pivot | Bad repair repeats a failing assumption, then failure evidence forces discovery before the next repair. | `node test/manifest.mjs` fails before repair and after the bad repair. | Yes, bad repair then corrected repair write. | Repair queue records context need and changes next action to read/search. | `completed` after distinct repair and targeted verification. |
| artifact-receipt-restore | Artifact proof claims completion without source plus verification evidence. | `node test/artifact.mjs` fails until source exists. | Yes, source file written after restore. | Compact/replay-restored pending repair and verification queues drive next action. | `completed` only after source and verification evidence exist. |

## Diagnostic Coverage

| Requirement | Diagnostic evidence |
| --- | --- |
| Wrong edit blocked then discovery resumes task | `harnessSpine.test.ts`: `blocks provider edit output while restored repair requires discovery`; normal QueryEngine chooses read, execution seam runs read, output edit claim is replaced with blocked output. |
| Generic verification rejected then targeted rerun succeeds or remains not-proven | `harnessSpine.test.ts`: `keeps targeted verification pending after a generic verification result`; `runCompactTargetedRerunTask` rejects a non-target result and reruns the target. |
| Bad repair changes strategy after rerun failure | `harnessSpine.test.ts`: `restores pending repair with missing context and changes strategy before repeating repair`; `workspaceRepairVerification.test.ts` covers first repair failure followed by second repair. |
| Incomplete artifact proof remains pending across restore | `harnessSpine.test.ts`: `runArtifactSourceProofRestoreTask` restores pending artifact source proof and completes only after source receipt plus targeted verification. |
| Lost continuation restores harness state and continues safely | `harnessSpine.test.ts`: durable session and compact restore diagnostics decode harness queues and drive normal targeted verification through QueryEngine. |
| Restored ledger alone cannot complete a task | `harnessSpine.test.ts`: `does not complete a continuation restored only from harness ledger success`; result verdict remains terminal truth owner. |

## Hard Gate Evidence

| Gate | Evidence |
| --- | --- |
| At least 3 tasks execute | The harness workspace diagnostics execute tax/status/restore/session/compact/artifact tasks plus the new pricing-discovery-block diagnostic. |
| At least 3 wrong or incomplete actions | Wrong edit while discovery is required; generic green without target coverage; incomplete artifact source proof; bad repair needing context. |
| At least 2 real failing command outputs | Workspace tasks record safe summaries from `node test/status.mjs`, `node test/tax.mjs`, `node test/compact-failing.mjs`, and artifact source checks. |
| At least 2 actual writes | Workspace tasks use ExecutionService writes for tax/status/session/artifact sources. |
| Generic green rejected | Generic verification is blocked when targeted files are missing. |
| Bad repair changes strategy | Repair failure strategy records context need and next action becomes read/search before another repair. |
| Incomplete artifact fixed after restore | Artifact source proof remains pending across restore and is completed after source write plus verification. |
| Lost continuation resumes from durable state | Session harness and compact harness decode restored queues and drive targeted verification. |
| Manual correction count | `0`; all writes are performed by the execution seam in disposable workspaces. |

## Non-Substitution Checks

- Not ideal-summary-only: diagnostics execute QueryEngine turns and runtime batches.
- Not proof-only: workspace tasks run real commands and write real files through ExecutionService.
- Not evaluation-only: behavior lives in runtime action authority, harness queues, session restore, repair strategy, artifact proof, and result consumers.
- Not ledger-only: restored ledger success remains insufficient without evidence/result proof.
