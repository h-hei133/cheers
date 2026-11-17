# C.4 / C.7 read-only acceptance audit

Snapshot: 2026-11-16T10:37:11Z. Main HEAD: `ae9a3f592f4573e0197a7b49e81f34d2e6510a22`, with existing D.1 and documentation changes. This agent read source and existing tests, then created only this report. No tests, gates, builds, provider/native probes, product changes, HANDOFF changes, commits, or memory writes were performed. Tests described below were inspected, **not executed**. Source arithmetic is a counterexample specification, not an executed reproduction.

## Disposition

| Item | Source qualification | Acceptance disposition |
| --- | --- | --- |
| C.4 | Default historical tool-text retention and common projection/measurement wiring exist. No product defect found on the traced seams. | Still unaccepted: root must run focused current checks and same-build multi-turn/compaction consumers. |
| C.7 | Per-request accounting, captured destination/rates, bounded persistence, `/cost`, and turn-end UI consumers exist. Missing cache-category evidence is lost; write pricing is wrong; UI wording overstates an overlap estimate. | Do not accept until the source-grounded defects below are reproduced, repaired by their owners, and verified through consumers. |

Neither disposition establishes remote cache savings, model understanding, service capacity, other platforms, push, or CI.

## Original research claims and current scope

- `.wiki/refactor/upgrade/tasks.md:36` requires default historical text retention, actual multi-turn prefixes, and consistent compaction budgets. Line 39 requires per-turn miss/cost attribution and unknown handling for missing real usage.
- `.wiki/wiki/references/pi-vs-cheers-deep-gap-analysis-2026-11.md:22-26,43-50,125-127` alleges sliding old-tool truncation and no miss accounting. Current source contradicts the **absence/default-pruning** claims; existence alone does not establish acceptance.
- `.wiki/wiki/references/pi-vs-cheers-full-audit-2026-11.md:115` already names `cacheWaste.ts` and compaction measurement. These reference documents describe different snapshots and cannot jointly establish the present verdict.
- `.wiki/wiki/references/pi-parity-prioritized-roadmap-2026-11.md:25` places loop/prefix work in Batch C. It supplies no executed current C.4/C.7 acceptance evidence.
- `HANDOFF.md:2169-2172` supplies the guardrail: one text policy for every projection/measurement consumer, separate initial-output/image policies, incompatible identity rejection, and overflow refusal before dispatch.

## C.4 traced consumers

1. `config/runtimeConfig.ts:184,451,579` declares the setting, defaults it to `false`, and resolves it through the existing merged configuration. `config/fields.ts:63` uses the existing boolean/override policy. `cli/provider/step.ts:171` forwards the captured runtime value.
2. `turn/messages.ts:28-42` defaults both omitted options and omitted `pruneToolText` to `false`, converts once, and passes the policy into the sole production `microcompactMessages` call. `core/query/microCompact.ts:111-115` returns old plain-text tool messages unchanged, including duplicates; mixed older tool images are independently removed while textual content remains. The low-level helper itself retains its legacy pruning default, but no other production caller was found.
3. `turn/context/prepare.ts:73-77,174-180,203-225,295-299` includes the policy/options in captured generation identity and currentness, projects once, binds raw/wire/replay identities, and passes exactly the same options into stored-prefix and measured-prefix reconstruction. Converted/image-normalized histories refuse unsafe index-based reuse.
4. `turn/measurement.ts:23,39-77` reconstructs the prior wire prefix using the same policy; rejects incompatible raw/wire/count/replay identities and exhausted measurements; subtracts only provable newly removed text. A retained projection has zero invented freed text tokens.
5. `cli/runtime/context/preview.ts:179,209-219` uses the same policy for outgoing history and measured-prefix calibration. `cli/runtime/compaction.ts:259-260,288-316` uses it for both fallback projected history and provider-measured prefix/tail budgeting. Closing schema changes refuse the ordinary anchor.
6. `turn/context/prepare.ts:226-237,255-289` applies the retained projected prompt to known input/window admission, checks applicable final-body limits, and produces a refusal before send. This is local admission evidence; it does not establish an undocumented remote limit.
7. `session/context/selection.ts:33-40,97-106` is **not** another default age pruner. With no explicit selection it returns session turns; its 2,048-character omission requires a matching saved `elide` selection. It should remain distinct from C.4 retention.

Existing tests to execute as a focused serial group:

- `config/runtimeConfig.test.ts:50,75-98`: default, trusted project/user/override, invalid setting handling.
- `core/query/compaction.test.ts:88-137`: retained duplicate text, mixed-media text retention, older-image removal, idempotence, original preservation.
- `turn/retention.test.ts:37-67,70-113`: bounded source in native request building, ordinary/closing requests, known window/input refusal before dispatch, configurable projection and prefix consumers.
- `turn/measurement.test.ts:31-58,76-168`: policy transitions, compatible retained anchors, stale/raw/wire/replay/image/bridge identities, actual provider-usage admission.
- `cli/runtime/context/preview.test.ts:152-192,195-235`: persisted history, preview/dispatch body equality for both policies, estimator consistency and measured-prefix reuse.
- `cli/runtime/compaction.test.ts:325-348`: retained text drives automatic-summary pressure while the disable switch remains effective; neighboring tests cover projected fallback and bridging.

These fixtures primarily exercise current request building with injected fetch and controlled history. They do not substitute for a current compiled runtime producing several real rounds and a compaction boundary.

Targeted pi comparison, after target inspection: `pi/packages/coding-agent/src/core/messages.ts:148-188` passes ordinary `toolResult` messages through its converter; `core/compaction/compaction.ts:267-270` applies a context-pressure threshold. This supports preserving old tool text independently of age, not replacing Cheers' existing preparation/measurement owners or removing image/initial-output bounds.

## C.7 existing sound boundaries

- `turn/context/prepare.ts:174-176` captures the selected physical provider/model, destination digest, and catalogue price snapshot before dispatch. `observability/usage/identity.ts:43-59,91-101` freezes copied rates, strips credential-bearing address components, binds buckets to price/destination, keeps price changes separate from cache identity, and preserves captured absent prices as unknown instead of applying a new catalogue.
- `turn/step.ts:429-465` counts provider usage, requires a validated request-bound prompt measurement for context/cache continuity, and marks whole-usage/unmeasured responses as gaps. Normal `createTurnRequest` owns the sent-request receipt; do not reproduce the already-classified C.2 fixture bypass by invoking an injected step without its receipt owner.
- `observability/usageTelemetry.ts:177-212,331-357` preserves foreground/background ownership, separates `request`, `usage-gap`, and `context-reset`, and does not add measured tokens for a gap. `cacheWaste.ts:127-140,161,228` breaks comparison at gaps/resets and rejects legacy/attributed continuity.
- `observability/usage/model.ts:18,137-172` and `usage/snapshot.ts:84-120,145-156` bound, validate, preserve, and merge the history. `usageTelemetry.ts:68-101` already labels unpriced cache-write cumulative costs partial.
- `/cost` calls both `summarizeCacheUsage` and `findCacheWaste` in `core/commands/cost/model.ts:37-43`; `cost/cache.ts:15-28` describes estimated overlap/extra cost and retained coverage. Actual turn-end UI calls `turnCacheMissNotice` in `cli/interactive/interactiveMode.ts:1255-1262`.

## C.7 source-grounded defects and counterexamples

### 1. Missing cache accounting becomes an observed zero (high confidence)

`provider/response/usage.ts:12-20` converts missing cache categories to numeric zero. `usageTelemetry.ts:193-212` stores those zeros and defines `reportedCache` as sticky positive activity at the destination, not current-field presence. `cacheWaste.ts:199-214` does not inspect even that sticky flag before comparison. An actual optional cache field and a measured zero are therefore indistinguishable.

Counterexample A: two successful, request-bound responses from the same priced destination have prompt counts 10,000 and 12,000, output counts 1, and **no cache fields**. Captured input/read rates are $1/$0.10 per million. Both history entries have `reportedCache:false`; `summarizeCacheUsage` reports unknown, but `findCacheWaste`/`detectLatestCacheMiss` derive 10,000 missed tokens and $0.009 and the turn-end UI reports re-billing. No provider evidence establishes caching at that destination.

Counterexample B: a compatible response reports `prompt_tokens:10000` with `cached_tokens:8000`; the next response reports `prompt_tokens:12000` and omits cache fields. The second entry inherits `reportedCache:true`; summary includes its fabricated zero and warning derives a 10,000-token miss. The provider did not report a zero on that response. Compare with the **explicit** `cached_tokens:0` control, which is measurable zero and must remain distinguishable.

Existing `usage/attribution.test.ts:132-142,214-225` expects misses from prompt-only records. That expectation encodes this behavior; it is not the C.2 receipt fixture issue. Lines 153-162 also deliberately treat missing cache fields after a hit as cache-accounted. A correction must classify these expectations before adjusting them.

Minimal owning repair: preserve per-request cache-category presence at the provider-usage normalization boundary and through the accounting record/history decoder. Separate a current measured-zero fact from sticky destination capability. Guard both miss arithmetic and hit-rate aggregation; old sticky-only zero entries cannot establish current measurement after reopen. Add production request/report consumers for absent, explicit zero, positive, partial, reset/gap, and persistence cases. Coordinate any `turn/step.ts` record plumbing with the C.2 owner rather than duplicating it.

### 2. Extra cost ignores cache-write pricing (high confidence)

`cacheWaste.ts:99-101,208` records paid-token count, but `detectMiss` ignores it and always uses `promptPerMTok - cacheReadPerMTok` at line 241. Cache-write tokens may carry a different paid rate.

Counterexample: previous prompt 10,000; current native usage has input 0, cache read 0, cache write 10,000. Captured rates are input $1, write $1.25, read $0.10 per million. Current algorithm reports $0.009; the all-write difference from a cache read is $0.0115. If the write rate is absent, current algorithm still emits $0.009 although the paid write price is unknown. The cumulative estimate correctly flags this missing-rate case as partial (`usageTelemetry.ts:83-100`), so the miss report contradicts it.

Minimal owning repair: derive the estimated paid rate from the current observed input/write buckets and their captured rates, including the write premium; withhold/mark unknown cost if an observed paid bucket lacks a rate. Preserve captured-null prices and endpoint/model change attribution. Test all-write, mixed input/write, absent write rate, and catalogue-edit-after-send consumers. Any mixed-bucket allocation remains an estimate and must be labelled accordingly.

### 3. Turn-end UI describes estimated overlap as measured re-billing (high confidence)

`cacheWaste.ts:229-230` uses `min(previousPrompt,currentPrompt)-currentCacheReads`, not exact prefix identity or an invoice. `/cost` explicitly labels this estimated overlap and hypothetical difference from a cache read (`cost/cache.ts:15-21`); `formatCacheMissNotice` instead says `prompt tokens re-billed (+$...)` (`cacheWaste.ts:167-178`) and the actual interactive consumer displays it.

Minimal owning repair: align the concise turn-end text with the existing estimate semantics and unknown handling. It must not claim measured identical-token re-billing, realized savings, or a provider defect from counts alone. Preserve proven model/destination switches as context, not cache-failure proof.

Targeted pi comparison: `pi/packages/coding-agent/src/core/cache-stats.ts:63-68` has the never-observed cache guard; lines 73-86 include input/cache-write paid costs in the estimated rate. This is relevant decision evidence. Pi's always-numeric usage and sticky activity assumptions must not erase Cheers' optional raw-field uncertainty. No wholesale port is warranted.

## Root-owned bounded acceptance proposals

Run serially after integration; first reproduce genuine counterexamples, then repair, then focused checks/reversal evidence. No delegated heavy execution.

1. **C.4 same-build Linux rounds:** use the current compiled CLI or installed public SDK with an isolated session and a harmless real `read` of a tracked-in-probe source under `.tmp/` containing a middle marker beyond the old 1,000-character prune limit but below initial output bounds. Continue at least five request rounds so the result crosses the legacy three-turn boundary. Capture report-safe final-body tool-text/prefix digests and actual dispatch receipts; assert unchanged retained tool text and original history for the default policy. Run the enabled-pruning control with the same bounded source. Do not dump credentials, headers, or full live-provider bodies.
2. **C.4 pressure/identity consumers:** compare real current-history preview and dispatch under the same captured policy; then drive actual automatic compaction using a bounded configured local threshold. Show retained text contributes to pressure, compaction-disabled known overflow sends zero requests, policy/endpoint/replay changes refuse stale anchors, and summary/continuation use the correct request owners. Preserve image/initial-output policies. Local configured limits do not prove remote capacity.
3. **C.7 same-build loopback consumers:** route actual runtime requests through a deterministic local HTTP fixture, varying only response usage presence/zeros/positives and captured rates. Exercise Counterexamples A/B and all-write/missing-write-rate arithmetic through normal `createTurnRequest`/turn settlement, `/cost`, turn-end notice projection, save/reopen, and reset/gap handling. Include a price publication change between requests: previous records must retain old prices; a price edit alone is not an endpoint switch. These prove local accounting contracts, not remote cache behavior.
4. **Configured-model evidence:** use isolated runtime state and unchanged configured credentials for a bounded multi-turn read/continue sequence on the same build. Record actual usage-field presence, selected destination/rates, source-span digests, and request counts. If cache usage or prices are absent, report unknown; do not substitute a presumed hit rate or loopback measurement. Observed cache reads describe those requests only. No improvement/savings, native cache-control protocol, TTL, or universal capacity claim follows from source retention. C.5 remains separate.

## Source snapshot hashes

SHA-256 captured at the timestamp above. Rehash any source changed by root/workers before relying on this snapshot. This is **source identity**, not build identity or execution evidence. Audited source paths below are relative to `packages/ts-shell/src/`.

```text
89e53def9d63ccfae698c1bf6729a3768fb82e4574a0bace85de5b0fdf718eb4  config/runtimeConfig.ts
3f219a0340114ac38bf8c5e2cb73134ed3fa31f0b4e43732ed0036b2c5ad610e  turn/messages.ts
5c962af2c0326bff3811715bebae1b4249f1c5061b47c82c0a2150d299c6a9ec  core/query/microCompact.ts
22cb1d276d37278ee418743e6f36c6810656e191d4110e522fb09b9e07d8786c  turn/context/prepare.ts
a50faecdc7cf3c1ef33a0700db58236ddf64ed56b95fe7b84be30bc6495ebbc3  turn/measurement.ts
9e09008340ccef1efab357650fa3563b22753b8ac08c702bade3618e36b08dae  cli/provider/step.ts
384dbacea134566f35d4650d8516c4676a3e9087aa44e664297e05b26f5cbd66  cli/runtime/context/preview.ts
62c991e9eaa6fb2165dcdf6f6529ef1c1d0d63587b8301904345827b96561f53  cli/runtime/compaction.ts
8d124752d7acf7dc922bc75dbefee6e1719d8348dbea94a07fa41a5fa732500b  session/context/selection.ts
aa6f32d740a08495ddc12856f8b542f1eb6815603756890780cbfb87f4bda7d5  provider/response/usage.ts
3dc077512bddc6d0537f81527a511a92a28ec0b7ab03cb13edeb4958221be281  observability/cacheWaste.ts
e4210e363b55e9c745af58fcd4629598844feeb5fcfc98b2e68055a0e62713a5  observability/usageTelemetry.ts
96cfad7524b6ae2af5b16091b542cb0ff66bdf909e4aea34ca0ad786a73b9985  observability/usage/model.ts
77927fd7a31a58696bf890316e647958ebe2e1617f24949fe58f03ba96dc411b  observability/usage/identity.ts
3d229789ae7961129f7e118fd6ac95fab77b2bcbfc66154ce7cedf9ad591edb1  observability/usage/snapshot.ts
84da6e7b187acd8afb045b921724e276f1453c2bd8a5d975b284cf7ebd16b82c  turn/step.ts
4fb8bf8003f61e0480bbd2d6cd9ba02cf53ecb519b3b79b2d195a295cec6112c  core/commands/cost/model.ts
d650573fa957d58bc139223997b6bae87b2a342a424c37a59d026e2b9d98160f  core/commands/cost/cache.ts
7ff25d3ff35766da318b55c17e070fcb4633bcd5d719658212fb79f8153e9906  cli/interactive/interactiveMode.ts
5998714de13c0548331ec3f953a3fa4d820464592fc4826671397289ed4e4eff  /home/wang/projects/pi/packages/coding-agent/src/core/cache-stats.ts
32714966eb644da31cd84e8eb172965256160626b3d26ae9752c3894300f2b0b  /home/wang/projects/pi/packages/coding-agent/src/core/compaction/compaction.ts
5397e3c96c9504266e4ee8b6e88d5098b3280ee7dbb0c687b74708c62a06c8d4  /home/wang/projects/pi/packages/coding-agent/src/core/messages.ts
```
