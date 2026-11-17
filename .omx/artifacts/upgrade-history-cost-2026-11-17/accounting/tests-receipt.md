# C.7 cache accounting counterexample tests

- Owner: `/root/cache_presence`.
- Worktree: `/home/wang/projects/cheers/.tmp/history-cost-worktree`.
- Branch: `work/history-cost`.
- Base HEAD: `d974d3a22166f04816abe22ae993aea99524172b`.
- Status: frozen, uncommitted, unexecuted. No tests, builds, gates, NormProof, provider, or native runtime commands were run by this owner.
- Only repository edit: new `packages/ts-shell/src/observability/usage/presence.test.ts`; existing attribution/cacheWaste tests and all production files are untouched.
- Patch: `/home/wang/projects/cheers/.tmp/history-cost-validation/tests.patch` (new-file patch, apply with normal `git apply`).

Exact SHA-256 hashes:

```text
3143f5615706502d0edef5e6e69c1fda5c67ad1293904824543f160d8a6704dd  packages/ts-shell/src/observability/usage/presence.test.ts
79306983013d1dcded0b50c7abf32d54c251ea31ee10ddc826b964d1c21ee5e4  tests.patch
```

The 13 cases exercise raw `usageFromProvider` normalization through request-bound `recordSessionUsage`, retained-history summary, cache-waste arithmetic, turn-end notice, and snapshot decode/reopen. They distinguish absent reads from explicit zeros without assuming new presence-field names. Coverage includes prompt-only responses; omitted, empty, and write-only cache categories after a hit; explicit-zero and reset/gap controls; old sticky-only zero history with positive legacy read evidence; all-write and mixed input/write premiums; captured missing write rates and later catalogue publication; and estimate wording.

The existing stale expectations in `usage/attribution.test.ts` are deliberately unchanged pending root baseline reproduction/classification. These controlled accounting tests provide no native/provider behavior, cache protocol, or realized-savings evidence.
