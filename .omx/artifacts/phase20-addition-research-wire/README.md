# Native research composition: actual CLI HTTP requests

This batch adds bounded evidence for ADD-11/12. No product source changed: the existing root-entry and stage prompt owners already inject every selected method. The earlier research-preview probe stopped before native children; this probe follows the original Node CLI through the real OpenAI-compatible HTTP adapter, `research_run`, sequential native children and the final parent continuation.

## Results

Both `regular-receipt.json` and `fullscreen-receipt.json` passed. Each uses one saved message, an isolated home/profile/project, two public skill fixtures and a loopback server. The server checks each actual request before replying. Child system prompts, runner, read tools, evidence validation, ledger, storage and terminal lifecycle are the product implementation.

| Case, per mode | Actual HTTP POSTs | Native result |
|---|---:|---|
| Unknown second skill | 0 | Exact original draft restored; state unchanged; no research run |
| First-position research + two skills + actual evidence | 12: 2 root, 10 child | One run, eight children, two actual reads, one content-addressed source, one bound claim, three report fragments, completed review/run |
| Body research entry + two skills + no evidence | 10: 2 root, 8 child | One additional run, eight children, zero reads/sources/claims, failed review, partial run, three explicitly limited fragments |

Every actual root entry and child prompt contains both exact skill bodies once. The root's `research_run` schema binds the admitted run ID; every child request uses that same ID. Durable methods retain both bodies and the exact original input, including its newline. Parent message metadata binds the same run and original input. Child request IDs are distinct and retained; no nested task/write/shell/research tools are offered. Each sequence is `brief → investigate → gaps → draft → review → report ×3`.

The investigator and reviewer each issue a native read through their own fresh child request. Identical selected content deliberately refreshes one source ID; separate child and request identities establish the two acquisitions. Review stays labelled `same-model-independent-context`; this is not independent source confirmation. A successfully returned review child with no reads still produces `review.status=failed` and a partial native result.

Both final statuses were actually painted. The native run's ledger scope exists, advanced and settled its reservations; no save was requested, config and project files stayed unchanged, Ctrl+D exited 0 and cooked terminal flags were restored. Per-mode caps: 768MiB Node heap, 60 seconds, 2MiB output and 30 POSTs. Actual output stayed below its cap, with 22 POSTs and two model-readiness GETs per mode. Owned scratch directories were removed.

## Provenance and failures

- Product HEAD at execution: `ed4820cbb214c29686cd5d9b7bb2144df8a0f3e0`.
- Immutable build: `7499028c41a4b125f9d40e17b29501c009d3db8a8783211cd7130ed93892a7f1`.
- Inputs digest: `336820d5bccff83c07312cede18a15fa093f35a8f1a389105cfad52633622578`.
- `checkBuild` verified freshness before each run. `pty.mjs` and `observe.mjs` passed Node syntax checks. Five static gates passed; 118 pre-existing docs-source advisories remain. No new unit tests/build or source reversals were needed for this evidence-only batch.
- `regular-source-identity-failure.json` preserves the initial incorrect fixture expectation of two retained sources. `producer.ts` derives identity from locator/hash/excerpts, and `mergeSources` refreshes matching IDs. The final probe checks two distinct child/read requests, one shared ID and current-review attribution.
- `regular-selected-text-failure.json` preserves the incorrect fixture expectation that hashes omit the terminal newline. Native `read` hashes `page.text`; final assertions hash the actual fixture bytes, check `selected-text` scope and separately check the retained quote. Neither failure required a product change.

Target implementation was inspected first. Read-only comparison with `/home/wang/projects/pi/packages/coding-agent/src/core/agent-session.ts:2150–2154,2228–2255` confirms expansion before ordinary dispatch/queueing and explicit skill context. That reference supports a leading single skill and passes unknown names through; the addition explicitly requires body/multiple invocations and refusal before native run creation. The target's stronger existing contracts and tests remain authoritative; no reference implementation was copied.

`prior-ci.json` is one delayed read: `316e4de7` CI `41035961101` and Watch `41035960972` completed/success; `ed4820cb` CI `41039139794` remained in_progress and Watch `41039139814` completed/success, exact heads matched. These are previous commits; this batch's later commit/push/CI are separate.

## Reproduction and limits

After obtaining a fresh product build, run serially from the repository root:

```sh
rtk proxy node --max-old-space-size=768 .omx/artifacts/phase20-addition-research-wire/pty.mjs regular
rtk proxy node --max-old-space-size=768 .omx/artifacts/phase20-addition-research-wire/pty.mjs fullscreen
```

The observer only records host startup, original retry restoration, scope, tool outcomes and turn settlement. It does not replace execution, model steps, prompts, admission or sources. The server is deterministic and uses only public fixture credentials/content; receipts retain request summaries rather than payload bodies or headers.

This proves bounded local runtime/request contracts, not generative research quality, external provider availability/billing, deep/paper/mixed workflows, recovery, save approval, gap reinvestigation, cancellation or cross-platform acceptance. Existing tests cover several of those separately, but they were not rerun here. No executable/20k terminal/full suite/independent review/NormProof judge was run. Original 47-task and ADD overall acceptance remain unchanged; the goal remains active.
