# Risk Register

| Risk | Why it matters | Affected regions | Mitigation |
| --- | --- | --- | --- |
| Stream/non-stream drift | `runMvpIntegratedFlow` and `streamMvpIntegratedFlow` both handle apply-patch terminal behavior and share the same runner setup. | 185-308 | Keep entrypoint parity tests and fenced/apply-patch stream tests after any route touching entrypoints. |
| Result truthfulness drift | Runtime currently assembles failed/changed/verified/unverified/evidence arrays before result projection. Moving these can accidentally upgrade failed or partial outcomes. | 500-2941 | Extract with receipt types; run `verify:result-contract` and Route221 anti-false-success gate. |
| Provider default drift | Chat/reviewer/provider drafting happens through `runProviderDraftStage`; no-write inspect flows must remain provider-free where currently tested. | 353-407, 479-491 | Preserve provider stage delegation and run no-write inspect real-mode tests from the legacy suite when touched. |
| Write authority drift | Runtime creates workspace authority and maps approval decisions for discovery/fenced/target-set/primary/cross-file edits. | 565-786, 1808-1909, 2055-2337 | Move authority assembly into edit-owned stages without changing explicit opt-in, denied, aborted, and stale-read boundaries. |
| Stale-read skip | Primary edit branch performs a final stale-read callback before write for edit-file. | 1837-1864 | Keep stale-read regression tests in any mutation extraction route. |
| Verification status collapse | Low-risk verification maps blocked/failed/passed with explicit reasons; command verification retries classify blocked vs failed. | 2361-2859 | Move as one verification stage or preserve exact projection tests. |
| Repair false success | Cross-file repair can return partial/degraded/remaining states. | 2055-2337, 2926-2932 | Keep remaining/degraded evidence and no-progress semantics in repair-owned receipt. |
| Evidence re-consumed as executable proof | `parseTransformEvidence` intentionally refuses stale blocker evidence. | 3186-3220 | Preserve parser tests before moving transform evidence handling. |
| Import cycle | Runtime imports many owners; moving stages can create cycles through legacy `orchestration/*` barrels. | 1-157 | Extract owner modules that depend on lower-level route primitives; avoid importing runtime from domain owners. |
| Compatibility export breakage | Legacy wrapper and tests still import `runMvpIntegratedFlow` and `streamMvpIntegratedFlow`. | wrapper and consumers | Keep wrapper path and type re-exports until direct consumers migrate. |
| Browser route ownership drift | Browser branch is thin but imports from `orchestration/browserModule.ts`; there is no `browser/` directory currently. | 851-859 | Do not move browser code in unrelated routes; future browser route can introduce real owner directory. |
| Session persistence confusion | Continuity state is consumed by runtime runner, but session persistence must remain outside runtime coordinator. | 311-436, helper residue | Do not add persistence to coordinator; only pass continuity inputs through. |
| Report compatibility drift | Historical Route227/228 reports and Route221 gates rely on result/evidence shape. | Result/evidence extraction route | Do not import reports into product runtime; validate through product result contract and Route221 gate. |

## Highest-Risk Targets

1. Verification and final result handoff. This is the largest truthfulness risk because a small projection change can convert blocked/skipped/not-requested into success-like output.
2. Mutation and cross-file repair. This is the largest write-safety risk because it combines stale-read, approval, multi-file partial failure, and repair degradation.
3. Discovery/fenced edit activation. This is the largest default-write risk because route activation, explicit opt-in, and approval mapping are in one branch.

## Lower-Risk Targets

- Entry point wrapper naming cleanup, if no behavior moves.
- Context read/inspect/repo-explain extraction, provided read-only/no-write behavior and missing/ambiguous target stops are preserved.
- Prompt helper cleanup after reference proof, because it can be verified by build and focused planning/continuation tests.

