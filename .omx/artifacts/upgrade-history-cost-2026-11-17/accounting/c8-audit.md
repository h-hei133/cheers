# C.8 tool discovery acceptance audit

Date: 2026-11-17. Scope: read-only source and test inspection; no tests, builds, providers, verification, or reference edits performed by this worker. This artifact is an acceptance handoff, not a passing verdict.

## Current implementation versus the November comparison

The historical comparison at `.wiki/wiki/references/pi-vs-cheers-deep-gap-analysis-2026-11.md:79` is no longer an accurate description of all current discovery behavior.

| Historical claim | Current Cheers implementation | Acceptance status |
| --- | --- | --- |
| Thirteen pinned tools | `core/tools/discovery/state.ts:13` pins six: read, glob, grep, bash, edit, write. Search/load add two declarations. Runtime restrictions can reduce this; explicit feature tools can enlarge the initial set. | Implemented; measure the actual admitted first-request set. |
| Naive substring ranking | `discovery/ranker.ts:119` uses BM25 with name weighting, term coverage, exact-name priority and stable name ties; substring matching remains a fallback. | Implemented; ranking quality has limited focused coverage. |
| No schema indexing or stemming | `discovery/ranker.ts:15` stems English plurals; `:23` normalizes Unicode and camel case; `:53` traverses property names/descriptions, items, unions and referenced local definitions. | Implemented; recursion/Unicode/escaped-pointer controls are still needed. |
| Every discovery needs search then load | `discovery/tools.ts:16` declares `load:boolean`; `:22` activates matches during `tool_search(load:true)`. Separate `tool_load` remains available. | Implemented; current test stops at snapshot membership, not full gated execution. |
| Prompt always gives rules for every tool | `turn/prompt.ts:100` filters web and workspace guidance using the supplied active names; initial request assembly applies restrictions before tool-name projection. | Initial filtering exists. The assembled system text intentionally stays fixed during loading. |
| Generation avoids repeated expensive computation | `discovery/state.ts:54` caches per-object fingerprints and the catalogue digest. The BM25 documents are rebuilt per search. | Digest optimization exists; no search-index cache or measured large-catalogue bound was found. Per-object mutation has a specific caveat below. |

Paths in tables and prose are relative to `packages/ts-shell/src/` unless explicitly rooted otherwise.

## Actual runtime consumer path

1. `core/tools/registry.ts:65` creates builtin definitions. `core/tools/catalog.ts:53` merges MCP, contributed and feature definitions, rejects collisions, and applies runtime visibility **before** discovery. If either discovery meta tool is forbidden, the admitted ordinary tools are offered directly (`:74`), so an allowed deferred tool does not depend on a prohibited loader.
2. `core/prompts/request.ts:21` selects dynamic versus full discovery, handles forced/allowed tools before building initial prompt context, and returns live `currentTools` and `currentOverhead` (`:41`). `turn/prompt.ts:61` supplies filtered initial tool guidance. A load refreshes declarations and overhead, while the initial assembled system text remains fixed (`request.ts:40`).
3. `entrypoints/cliRuntimeInvocation.ts:372` passes discovery to the provider step and supplies `toolSnapshot: () => discovery.snapshot()` to `runTurn`. `cli/provider/step.ts:144` supplies the live tool snapshot to request construction. `turn/context/prepare.ts:107` captures current declarations; `:292` rechecks capture currency before dispatch.
4. `turn/session.ts:225` resolves the live tool pool for permission hooks; `:241` adapts a fresh pool for the agent kernel. `core/agent/loop.ts:532` resolves this pool for each tool batch. A search/load batch updates discovery; the next provider request and subsequent batch see the activated tool.
5. `turn/tools.ts:127` validates tool arguments and prepares the original request. `:320` applies plan mode, permission scope, live admission checks and PreToolUse hooks; `:185` executes through the same gate and workspace bindings as other tools. Loading alone supplies no approval. Unknown custom tools still require ordinary authorization. `discovery/state.ts:91` wraps execution/preparation and `:163` wraps the prepared effect boundary to reject stale definitions.

An invocation attempting search and a previously undeclared tool in the *same* returned tool-call batch must not assume activation makes the latter available in that batch: the batch pool is resolved before executing search. The supported scenario is search/load, next provider request, then the activated call.

## Generation contracts and bounded limitations

**Object replacement is guarded.** The digest includes names, descriptions and schemas. Catalogue-owned snapshots require the same current tool object and captured fingerprint. Meta snapshots require the same catalogue digest. Prepared execution rechecks the definition after asynchronous preparation and approval. Unchanged tools are not globally revoked merely because another catalogue entry changes; the guard is per definition for ordinary tools. Active-set changes are reflected by live declarations, not by catalogue generation alone.

**Same-object schema mutation is an uncovered, reachable contract case.** `ToolDefinition.argsSchema` is `Record<string, unknown>` (`tools/types.ts:75`), so its nested contents are mutable even though the property is readonly. Public SDK `customTools` pass their original definitions to contributions (`sdk/agentSession.ts:116`); `core/catalog/contributions.ts:53` freezes only the contribution wrapper. The in-process extension registration (`extensions/runtime/inProcessLoader.ts:235`) copies the tool object but retains the same schema reference. None of these inspected ingresses snapshots or freezes nested schemas.

`discovery/state.ts:54-63` calculates each object's fingerprint only once. Mutating an existing schema object after a generation/snapshot was captured can therefore leave `generation` and the stale guard unchanged while the schema reference and its validation meaning change. This is a source-proven limitation, **not an executed counterexample or confirmed observed runtime failure**. No supported hot-mutation API or native failing receipt was found. Before promoting it to a fix, either demonstrate the retained-reference SDK case or establish an immutable capture contract at ingress. Do not infer that every MCP update is affected: `core/mcp/catalog.ts:15` clones server metadata and tracks contract IDs, and MCP refresh is a separate lifecycle owner.

Suggested deterministic counterexample for the main agent: keep one SDK/custom ToolDefinition and schema reference; capture the discovery generation and snapshot; mutate a nested property type or schema description through the caller-held reference; compare old/new generation, request declarations and attempted old snapshot execution. This must compare actual consumer behavior and include immutable/replacement controls. A useful asynchronous control replaces the definition while `prepare` or an approval is pending and asserts no prepared effect executes. Existing stale tests replace definitions **before** calling prepare; they do not exercise replacement during pending preparation or approval.

**Loaded state is run-local in the inspected path.** A new `loadToolCatalog` creates a new discovery/loaded set. No persistence or cross-turn activation contract was found in this seam. Do not require persistent activation unless the accepted C.8 scope explicitly includes resume/fork semantics.

**Prompt stability is intentional local behavior.** New tool-specific prompt rules are not rebuilt on load in the normal path, while schemas and accounting are refreshed. This is asserted in `core/prompts/request.test.ts:19`. If acceptance demands new tool-specific guidance after activation, that requires an explicit design decision. A stable local system digest does not prove provider prompt-cache hits or cost reductions; C.5 cache protocol evidence is separate.

**Search index scope differs from pi.** Cheers indexes MCP namespace names inferred from `mcp__<server>__<tool>`, but the current ToolDefinition has no namespace description/instructions field. No persistent ranker index cache was found. Both are bounded implementation facts; performance or retrieval deficiencies require measured cases rather than historical claims.

## Targeted pi comparison

Only corresponding reference files were read, after inspecting Cheers.

- `/home/wang/projects/pi/packages/coding-agent/src/extensions/tool-search/tool.ts:77` makes the same small English plural/Unicode normalization decisions. `:104` follows local schema references; `:131` additionally incorporates explicit namespace descriptions/instructions. `:222` rebuilds indexed documents per query, so pi is not evidence for requiring an index cache.
- That file's `searchAndLoad` at `:300` searches inactive deferred/codemode tools and calls `setActiveTools` in the same operation. Activation is recorded in the transcript and survives branch resume/fork by that documented contract. Cheers searches all admitted catalogue tools, marks loaded/pinned results, and makes loading optional. These are different explicit semantics, not proof that one is broken.
- `/home/wang/projects/pi/packages/coding-agent/src/core/system-prompt.ts:88` derives rules from selected tools; `:150` excludes hidden declarations; `:216` supplies independently replaceable section diffs. Cheers uses filtered initial guidance and stable assembled text. Do not mechanically transplant pi's structured prompt protocol or equate source resemblance with cache preservation.

## Existing focused evidence and minimal validation set

Source inspection identified these existing suites; **this worker did not run them**. The main agent can combine the files in one serial Vitest invocation.

- `core/tools/discovery/state.test.ts`: initial six/meta set; deferred background tools; search/load shapes, limits and notifications; schema/description replacement generation; refusal of stale execute/prepare; one multiword/stemming/local-ref query and single-call loading.
- `core/tools/discovery/evaluation.test.ts`: full versus initial/post-load declaration surface and reported tokenizer uncertainty. This is a helper/accounting check, not native tool execution.
- `core/tools/catalog.test.ts`: actual discovery entrypoint admission, hidden/disabled/allowlist behavior, empty catalogue and captured child scope.
- `core/prompts/request.test.ts`: initial subset, changed schema digest with unchanged system digest, allowed/forced selections, no-tools projection and cancellation.
- `turn/prompt.test.ts`: active-name filtering of tool rules.
- `cli/provider/step.test.ts:288`: loaded large schema charged on the next actual step; overflow prevents another provider dispatch.
- `turn/tools.test.ts:42`: original asynchronous preparation, live admission checks after approval/hooks, schema/permission/plan gates and refusal handling. It currently lacks discovery-generation integration across pending preparation/approval.
- `turn/session.test.ts:352`: discovery usage purpose comes from the corresponding assistant tool call and preserves declaration markers. Include if validating user-visible discovery measurement and usage accounting.

`turn/step.test.ts:91` is an additional wire-measurement suite for accepted prompt/schema identity; useful if request identity/accounting is changed, not automatically necessary for a discovery-only change.

Remaining acceptance gaps: full search→load→next-request→gated-execute integration; pending-prepare/approval generation invalidation; mutable schema ownership; ranking controls for recursive/shared/escaped refs, remote refs, Unicode, exact names, coverage versus repetition and deterministic ties; actual large-catalogue timing/surface measurement; provider-native evidence for the stated scenario. Narrow greens or helper evaluation must not close all these gaps.

## Recommended native scenario

Use the public compiled SDK from `packages/ts-shell/dist/index.js` after the main agent's serial build. Keep the existing C.4 harness separate. All state and bounded receipts stay inside `.tmp/history-cost-validation/`; use the configured permitted target, private HOME/session state and report-safe request/response digests and declaration names only.

1. Register a benign deferred custom tool whose capability query term occurs **only** in a local-ref schema description. Give it a deterministic no-write output marker and an invocation counter. Start dynamic discovery with its name absent from first-request schemas. Do not set `tools` to a restricted list that excludes the search/load pair: that would intentionally disable discovery.
2. Ask the provider to discover the unique capability using `tool_search` with `load:true`, then call the identified tool after its schema becomes available. Observe the actual emitted tool-call arguments and results; the prose instruction alone is not evidence.
3. Prove the first accepted request omits the custom schema, the search result identifies and loads it, the next accepted request includes the exact schema, and the actual execution counter/result marker increments through the gate. An unchanged system digest plus changed schema digest is expected in the inspected contract. Distinguish provider refusal/deviation, auth/network failure, and product routing failure.
4. Use ordinary explicit `nonInteractiveApproval:'allow-once'` for the no-write success control, then a denied-approval or blocking PreToolUse-hook control with zero execution count. Discovery activation must not bypass that refusal. Optional malformed arguments must fail before the custom execution counter increments.
5. Separate hidden/disabled control: exclude the tool at runtime and prove it is absent from admitted search results and declarations. A forbidden discovery pair should instead exercise the direct admitted-pool contract, not be mislabeled as a broken loader.
6. Perform generation/mutable-reference and asynchronous invalidation controls in focused local integration first. Avoid nondeterministically mutating catalogue state during a paid provider request merely to manufacture a race. Keep any absent native generation/cache evidence explicit.

The current artifact records implemented mechanisms and concrete unexecuted boundaries. It does not close C.8, establish provider cache preservation, or justify production changes by itself.
