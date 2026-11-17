# G5 catalog composition tests

Status: authored; unexecuted. The test-writing agent ran no tests, builds, gates, npm commands, providers, probes, or NormProof. Predictions below are source-derived expectations, not red or green evidence.

Owned source: `packages/ts-shell/src/core/tools/codemode/composition.test.ts`

SHA-256: `6c016b5658055e36b09763fcc3b598a860a903682df5da31b7df5feefae17d6e`

## Fixtures and consumers

All cases call the actual `loadToolCatalog` and actual codemode Worker. They provide `sdkSkills: new Map()` to keep skill filesystem discovery out of the fixture, with no registry override and no replacement codemode definition. Contributions enter through `registerCatalogContribution`; cleanup retires every fixture.

Each case creates a real isolated session with `SessionManager` under `/tmp/cheers-test/`, stubbing HOME, USERPROFILE, CHEERS_TEST_ROOT and GIT_CEILING_DIRECTORIES. File effects remain inside that isolated workspace; cleanup removes the fixture. The direct consumer calls the definition returned by the composed catalog without injecting a toolCatalog or nested executor. The adapted consumer goes through `adaptTools` and its real preparation, permission and hook path.

The integrated turn uses `runTurn` with a scripted StepFunction, two unmodified builtin read definitions, actual onMessage-to-SessionManager persistence and a fresh SessionManager resume. It is controlled local execution evidence; it does not represent a live-provider send.

## Predicted baseline failures and controls

There are 18 expanded cases. Predictions use the source inspected before root-owned G5 wiring: `loadToolCatalog` copies the core registry, codemode retains the original core resolver, and the adapter passes only its loaded outer table.

| Case | Expanded count | Prediction on that baseline | Required observation |
| --- | ---: | --- | --- |
| discovers and calls feature and session tools through the adapted consumer | 1 | control pass | Both composed tools are searched, described, called and recorded; another session's contribution is absent. |
| discovers and calls feature and session tools through the direct consumer | 1 | red | The direct composed definition must see both tools without a caller-injected resolver. |
| keeps allowlist / disabled tools / hidden prefixes effective through the adapted consumer | 3 | control pass | Excluded core glob and excluded contribution are absent in ALL_TOOLS, description, search and callable properties; builtin read succeeds; excluded file effect never runs. |
| keeps allowlist / disabled tools / hidden prefixes effective through the direct consumer | 3 | red | The core resolver must not reintroduce excluded glob; the permitted real read remains usable. |
| calls an admitted deferred tool without loading its outer schema through the adapted / direct consumer | 2 | red | Initial codemode and feature schemas remain loaded; deferred session tool is discovered and called inside the same script; discovery.load is never called, loaded flags stay false and outer schema keys/generation do not widen. |
| settles schema mutation / definition replacement / removal with deferred=false | 3 | control pass | Hold the original PreToolUse gate; mutate only an argument description, replace exact definition or remove it; old version refuses before either captured or successor effect. Fresh acquisition after mutation/replacement succeeds. |
| settles unchanged control / unrelated change control with deferred=false | 2 | control pass | Captured effect succeeds exactly once; another tool's generation change does not retire an unchanged definition. |
| settles schema mutation / definition replacement with deferred=true | 2 | red | Deferred tool must reach the real captured hook, then the old guard must refuse; fresh snapshot succeeds while its outer schema remains unloaded. Baseline never reaches the hook because the nested loaded table omits the target. |
| persists one filtered parent result after two real builtin reads in runTurn | 1 | control pass | Two read calls settle with raw nested IDs and no recorded output payloads; exactly one outer event/message reaches the next request and durable transcript; discarded raw markers never enter either history. |

Predicted total: 8 red cases and 10 pass controls. No observed counts are available yet. Existing broad tests and fixtures are not altered.

## Regression and reversal requirements

- Revert only catalog-bound composition: the direct feature/session and direct restriction cases must fail.
- Revert full admitted nested snapshot selection: both deferred-call cases and both deferred retirement cases must fail while ordinary loaded controls retain their behavior.
- Use unguarded `discovery.catalog` for the full nested pool: the deferred mutation/replacement cases must detect the old effect or silent switch to the successor. The mutation leaves submitted arguments valid to isolate the contract-generation decision.
- Replace per-definition guards with a whole-generation check: the unrelated-change control must fail.
- Emit intermediate nested output into outer history: the runTurn case must detect extra messages or leaked raw markers after actual reopen.

The captured hook tests use a bounded vi.waitFor and release in finally. The failure cleanup aborts the parent and drains the pending Worker so an assertion cannot strand a captured call.

Root owns verification. Run these tests from the owning ts-shell package together with affected existing discovery/catalog/turn tests in one serial Vitest process, after the required static gates. Record actual failure classes separately from these predictions; setup, discovery or compilation failures are not assertion-red evidence. Use root-owned source capture for reversal and do not overwrite another agent's work.
