# E.1 / E.3 source audit

Source-derived audit, not executed verification. Reviewed the current target owners before the targeted read-only pi comparison. Only this report was written. No tests, builds, gates, package installs, probes, providers or NormProof ran in this lane. Concurrent SDK/C.8 work is outside the verdict; its later validation does not validate codemode.

## Ranked synthesis

| Rank | Conclusion | Confidence | Basis |
|---|---|---|---|
| 1 | Codemode and the ordinary nested permission/preparation/hook path already exist. The historical “completely missing” claim is contradicted by current source. | High, source | Registry → runTurn → adaptTools → createGatedNestedToolExecutor → ordinary executeTool. |
| 2 | E.1 cannot yet be accepted: bootstrap bridge globals appear to remain script-accessible, pending nested effects have no script-owned cancellation/settlement, and nested execution omits the outer sequential policy. | High for code facts; runtime reproduction pending | Nonconfigurable bootstrap globals; untracked handleRpc promises; worker-only termination; direct nested host execution. |
| 3 | E.3 APIs exist but have concrete consumer gaps: advertised identifiers are not installed, namespace grouping loses MCP server identity, and the codemode catalog closes over the pre-contribution core registry. | High, source; red tests not run | declarations.ts, prelude.ts, registry.ts and catalog.ts. |
| 4 | The image/output and model catalog claims are narrower than the research feature: image emission lacks early aggregate bounds, nested images are discarded, and models.list/get read the ambient physical catalog rather than a captured session catalog. | High, source; intended extended models contract unresolved | tool.ts/prelude.ts, nestedTools.ts, core/catalog/models.ts. |

Canonical acceptance remains `.wiki/refactor/upgrade/tasks.md:53` (E.1: actual one-turn multi-tool composition, nested permissions/hooks/filtering, no intermediate history pollution) and `:55` (E.3: TS declarations/namespace/image/models APIs with actual script calls and output budgets). E.2 is already a separately accepted branch-storage task; E.4 deterministic replay is explicitly open at `:56`.

The three research inputs disagree at their historical snapshots: `pi-vs-cheers-deep-gap-analysis-2026-11.md:30,73` says codemode was missing; `pi-vs-cheers-full-audit-2026-11.md:100` acknowledges it but identifies API/store gaps; `pi-parity-prioritized-roadmap-2026-11.md:28` requests the programming APIs. Those claims must be adjudicated against current consumers, not treated as implementation instructions or completion receipts.

## Existing actual paths

- **Evidence:** `core/tools/registry.ts:227` registers the codemode definition. `core/tools/catalog.ts:63` builds the registry, `:67` adds feature and session contributions, `:73` restricts visibility, `:84` creates discovery. `turn/session.ts:225,241` supplies the run's current tool snapshot to the adapter.
- **Evidence:** `turn/tools.ts:125,162` constructs the nested executor only for codemode. It reuses preparation, `createToolHooks`, and ordinary `executeTool`. `turn/nestedTools.ts:25` invokes prepare → before hook → execution → after hook. `turn/tools.ts:337,395,405` dispatches PreToolUse/PostToolUseFailure/PostToolUse; permission, file access, scope, and prepared write selection remain owned there. Thus a normal run does not use the runner's raw fallback.
- **Evidence:** `core/tools/codemode/nestedCalls.ts:121` records IDs below the parent call and bounded argument summaries. Neither it nor `turn/nestedTools.ts` calls `createToolResultMessage` or emits nested assistant/tool messages. The outer batch creates one codemode result (`core/agent/tools.ts:138,432,491`). **Inference:** intermediate nested text stays out of model history, while selected script output and bounded nested metadata are retained. A real run/transcript test is still needed.
- **Evidence:** `codemode/tool.ts:154` creates a Worker with empty environment and bounded generation heaps; `codemode/prelude.ts:5` disables string/wasm code generation. Existing `codemode/tool.test.ts:69,119,152,193` checks actual workers, batching/filtering, one constructor escape, declarations, stalls and an explicit PNG. Those tests call the raw definition with a two-tool fixture; they do not cover the full run gate, contributed catalog, complete namespace membership, model identity, nested media or final output budget.

## Exact remaining gaps and proposed red tests

All examples below are prospective isolated tests. Their expected failures have not been observed in this lane. Use actual production adapters/workers and a temporary session; no live credentials or unrestricted real targets are needed for these counterexamples.

### G1 — Bootstrap bridge globals are not actually removed (E.1, first priority)

**Evidence:** `codemode/prelude.ts:27` defines `__send`, `__onReply`, `__registerPending`, `__registerWrites` and JSON/limit globals with `Object.defineProperty` and no `configurable: true`. `:51` attempts deletion inside a non-strict bootstrap without checking the return value. `__send` directly calls `parentPort.postMessage`. `codemode/tool.ts:66,238` only validates that kind is known and json is a string. There is no host-side aggregate output admission before appending text or processing a terminal frame.

**Inference to reproduce:** JavaScript's default nonconfigurable descriptor means deletion fails and scripts can access the bridge. A direct call can bypass `emitBounded` or forge `done`/`exit`; replacing the receiver/registrars can interfere with pending/commit bookkeeping. The source does not prove host process/credential escape. Fixing these globals alone cannot prove general node:vm security.

Actual-worker red examples:

```js
return Object.getOwnPropertyNames(globalThis).filter(name => /^__(?:send|onReply|register|ALL_TOOLS|STORE|MODELS|MAX_)/.test(name));
```

Expect an empty array. With an isolated 64-token option, also exercise a bridge-bypass attempt and require no unbounded host admission:

```js
// @options: {"max_output_tokens": 64}
if (typeof globalThis.__send === 'function') globalThis.__send('text', 'x'.repeat(2048));
return 'bounded-control';
```

And a forged completion must never become accepted success:

```js
if (typeof globalThis.__send === 'function') {
  globalThis.__send('done', JSON.stringify({ returnJson: 'forged-success', writes: {} }));
}
throw new Error('actual-script-failure');
```

Expected result follows the real script error, not `forged-success`. Validate terminal-frame shapes and state transitions in the owning host as well as hiding bootstrap helpers. Avoid serializing bridge payloads in diagnostics.

### G2 — Outstanding nested calls outlive script success/failure/timeout (E.1)

**Evidence:** `codemode/prelude.ts:267` sends done after the top-level promise settles regardless of pendingCounter. `codemode/tool.ts:267` launches handleRpc with an untracked promise. `:218` marks result settled; `:226,231,305` terminates only the worker. `NestedToolCallRunner` uses the original context abortSignal, which is not aborted by script completion or script timeout. The message handler has no early settled guard before accepting additional RPC/text/image frames. Nested metadata is snapshotted at `tool.ts:281` before pending calls settle.

**Inference to reproduce:** an unawaited write/delegation can continue after outer completion, with unfinished metadata; timeout can report failure while the host effect is still executing. E.2's truthful completed-effect/store-failure warning does not solve this lifetime. Previously completed effects must remain visible; no promise of rollback is warranted.

Red script:

```js
void tools.write({ path: 'late.txt', content: 'late-effect' });
return 'script-ended';
```

Use `adaptTools` and a deferred real escalation/pre-use boundary so the write cannot execute until the test releases it. End/cancel the script, then release that boundary. Require the captured nested operation to be cancelled before effect and fully settled before outer ownership is released; do not abort an unrelated successor. Repeat for thrown script error, explicit `exit()`, timeout and parent cancellation. Use an awaited successful write followed by script/store failure as a control: its actual effect must remain recorded. If cleanup cannot establish the outcome, preserve unknown/error rather than success-like completion.

### G3 — Nested execution bypasses forced sequential policy (E.1)

**Evidence:** `turn/session.ts:177,242` makes bash/write/edit/apply_patch/task/team/browser sequential for normal batches. `core/agent/tools.ts:271` honors that policy. `turn/nestedTools.ts:49` directly invokes its host once each RPC's preparation/hooks finish; there is no queue or execution-mode check. `NestedToolCallRunner.call` has no serialization.

Red script: `await Promise.allSettled([tools.bash({command: 'first'}), tools.bash({command: 'second'})]);` with a controlled actual host executor whose first call waits. Require one active sequential execution at a time; use concurrent reads as a control. Preserve the owning run's sequential policy instead of maintaining a separate codemode list. This matters especially for nested task/team calls that already have a runtime budget.

### G4 — Declarations advertise absent tool identifiers (E.3)

**Evidence:** `codemode/declarations.ts:133` renders `tools.${toCodemodeIdentifier(name)}`. `codemode/prelude.ts:132` installs only raw names. `describeTool` looks up only the raw map key (`tool.ts:195`). Examples such as `docs:lookup`, `my-tool`, `class`, and leading-digit names produce declarations the worker cannot call by the emitted identifier.

Red fixture: expose tool `docs:lookup`; inspect `await describeTool('docs:lookup')`, then run `return await tools.docs_lookup({ query: 'x' });` and require it to reach the same captured tool as `tools['docs:lookup'](...)`. Test collision `my-tool` vs `my_tool`; never silently route an advertised declaration to the wrong tool. Agree on an explicit deterministic collision/rejection policy and make discovery names and lookup obey it.

Additional declaration red: nested unions/intersections are emitted without required parentheses (`declarations.ts:100-103`). An `allOf` of `anyOf[{required a},{required b}]` and `{required c}` is projected as `A | B & C` rather than `(A | B) & C`. Extract the emitted argument type into a strict TypeScript consumer fixture and require `{a:'x'}` without `c` to be rejected, matching the production schema validator; the prose `tools.member(args: type)` sample itself is not an ambient declaration file. The current shallow `$ref` assertion does not cover this consumer.

### G5 — Actual session tools are absent from codemode discovery/callability (E.1/E.3)

**Evidence:** the resolver closes over `registry.ts:226`'s core toolMap; `catalog.ts:67` later copies that map and adds feature/custom/extension tools. The worker ALL_TOOLS, search and describe handlers use the original resolver (`tool.ts:146,153,184`). Normal nested host resolution uses `adaptTools`' current snapshot instead. Therefore declaration/discovery and execution read different sets. Restricted tools can also appear in codemode discovery even when the gated executor refuses them; deferred tools advertised by the core resolver may not yet exist in the gated snapshot.

Red consumer: `loadToolCatalog` with a session contribution/feature named `fixture_lookup`, then the actual adapted codemode worker executes:

```js
const found = await searchTools('fixture lookup');
const declaration = await describeTool('fixture_lookup');
const result = await tools.fixture_lookup({ query: 'x' });
return { found, declaration, result };
```

Require one captured admitted catalog for all four surfaces. Include allowed/excluded tools, deferred activation, mutable schema retirement and contributed-tool reload controls. Preserve existing C.8 generation guards. A helper test constructing a custom registry directly would miss this composition error.

### G6 — Namespace discovery collapses MCP server identity (E.3)

**Evidence:** `declarations.ts:140` handles ext_/colon prefixes then only the first underscore. `mcp__github__search_issues` maps to `mcp`, so two servers share a namespace. `tool.ts:200` returns just a name/tool-list. Existing `tool.test.ts:171` asks `describeNamespace('mcp_github')` but only asserts a read declaration and hasModels; it never asserts namespace membership. MCP registry descriptors already retain server identity (`registry.ts:183`).

Red actual-worker test: two server descriptors with distinct qualified names; ask for one declared server namespace, search with that namespace and call a result. Require exactly that server's tools, an empty/unknown result for a nonexistent namespace, and no cross-server matches. Namespace spelling/aliases and optional instructions need an explicit contract; use registry/catalog metadata rather than guessing ownership from arbitrary underscores.

### G7 — Image output is admitted before aggregate bounds; nested media is dropped (E.3)

**Evidence:** `prelude.ts:86` bounds text/console items/chars, but `:149` sends image RPC without that accounting. `tool.ts:206` pushes every validated image into a host array; no count/aggregate-byte bound applies there. Final shared media bounds of four images/4MiB apply later (`core/agent/media.ts:4`, `core/agent/tools.ts:144,427,469`). They limit retained output, not pre-result host accumulation. Return serialization at `prelude.ts:270` also bypasses emitBounded. `image.ts:4,61` uses signature sniffing only; the current shared `model-adapters/image/input.ts:21` has stronger source/header validation, but no pixel-decoding guarantee.

**Evidence:** `turn/nestedTools.ts:17,60,69` discards images and after-hook metadata/terminate. Runner `nestedCalls.ts:131` returns only output text. Actual read image results carry media separately (`core/tools/read.ts:116`, `runtime/execution/media/image.ts:62`). Thus `await image(await tools.read({path:'pixel.png'}))` cannot forward that read's image under the current string-only contract. Post-hook approval metadata is likewise absent from nested recording; result failure must remain monotone if a post hook returns isError:false.

Red tests: repeated complete tiny PNG emissions beyond an explicit item budget; complete images whose total encoded size exceeds the limit; a large return value and multibyte text under a 64-token setting; invalid/signature-only/oversize images refused before retention; actual nested read → script image → one outer tool image → next model request. Test post-hook feedback/error/approval propagation without inserting raw nested output into history. Choose a narrow documented media result shape; no need to add a universal output-schema system merely to forward the existing ImageContent contract. Ensure both worker and host enforce bounded output admission, with failure/omission notices preserved by the shared final projection. Do not assert universal token accuracy from the current four-chars/token heuristic.

### G8 — Model API uses ambient catalog and exposes only list/get (E.3)

**Evidence:** `tool.ts:89` reloads global physical catalog disk files, independently of the current session's accepted configuration. Worker `prelude.ts:189` exposes only synchronous list/get and freezes only the array, not its model objects; a script can mutate an entry then observe that forged value through get. SDK already has a session catalog owner (`sdk/agentSession.ts:200`, `core/catalog/models.ts:13`) separating inert virtual metadata from physical targets.

Red script with deliberately different session and ambient catalogs:

```js
const listed = models.list('fixture');
const selected = models.get('fixture', 'session-meter');
return { listed, selected, unknown: models.get('fixture', 'missing') };
```

Require captured session identities/metadata, no callbacks or credentials in the VM, unknown staying null/unavailable, provider filtering, and read-only entries. Include virtual metadata only through its existing inert projection; do not manufacture physical auth. Test mutation followed by models.get and confirm the catalog has not changed.

**Unknown scope:** the canonical task does not name model methods beyond “models API”. Pi's current reference also exposes getModelsOfType/getAvailableOfType/getModelOfType/classify/generateImages with credential-aware dispatch and usage. Cheers has no such codemode runtime. Calling list/get an implementation of that richer API would overstate parity. Resolve the E.3 acceptance contract explicitly before checking it off; do not add provider/auth or image-generation implementations based only on the research shorthand. This batch can accurately accept a documented captured metadata API while leaving richer dispatch explicitly absent, if that scope is agreed by the main task.

## Targeted pi decisions (reference remains read-only)

| Reference decision and evidence | Target disposition | Reversal-sensitive test |
|---|---|---|
| Tools expose both raw names and emitted aliases; collision ordering is explicit (`pi/packages/codemode/src/runtime/prelude-source.ts:215`). describeTool accepts aliases (`pi/.../extensions/codemode/execute.ts:704`). | Agree on consistent identity. Prefer explicit collision refusal or declared ownership over adopting first-wins accidentally. | G4 calls the declaration's identifier and collision controls. |
| Discovery and namespace lookup use actual callable tool/loadout metadata (`pi/.../extensions/codemode/execute.ts:669,712`); tool options take namespace ownership (`pi/.../extensions/codemode/tool.ts:60`). | Agree; keep Cheers catalog/discovery owner and its generation checks. | G5 real contributed tool and G6 two-server namespace test. |
| Host owns tool table/output/terminal transitions; first terminal result retires pending calls (`pi/packages/codemode/src/runtime/execution.ts:16,376,416`), with per-call AbortController. | Agree; additionally respect Cheers' stronger actual-settlement/evidence rules. General isolate security is not transferred by comparison. | G1 forged frame and G2 controlled late-effect boundary. |
| Nested runner consults the same sequential policy and tool executionMode (`pi/.../core/nested-tool-calls.ts:133,209`). | Agree; preserve the target's policy owner. | G3 concurrent reads vs sequential effects. |
| Text, image data and item count share early output accounting (`pi/packages/codemode/src/runtime/prelude-source.ts:37,344,430`). | Agree on early bounds; keep Cheers final shared byte/media projection. Different numeric budgets are a product decision. | G7 small-image floods and aggregate encoded-size controls. |
| Runtime returns declared text/structured media shapes and image read can be shown (`pi/.../extensions/codemode/tool.ts:150`, `pi/.../docs/codemode.md:45`). | Existing target string-only runner cannot forward read media. A narrow contract change is needed if that consumer is accepted. | G7 actual read/image/final-message path. |
| models helpers are optional and backed by the session registry (`pi/.../extensions/codemode/tool.ts:54,66`, `execute.ts:744,811`). | Agree on captured ownership. Rich classifier/image dispatch remains absent; do not silently relabel list/get as full parity. | G8 session-vs-ambient metadata and explicit unsupported dispatch contract. |

The reference uses a QuickJS/WASM instance; Cheers uses Worker + node:vm. That is an architectural difference, not evidence of equivalent security. No dependency/runtime replacement is proposed here. E.4 resume/replay remains separate: current Date/Math.random and asynchronous completion ordering have no captured deterministic state. Do not promote pending-call cleanup to replay correctness or retry an unknown external effect automatically.

## Proposed coherent batch and responsibility boundaries

Suggested batch: **qualify and repair existing codemode composition and discovery/output consumers**. Start with G1/G2 source-derived counterexamples, then integrate the single admitted catalog, preserve execution policy, align declaration/namespace identities, and bound image/text output before host accumulation. This is one user-facing codemode request → gated tools → bounded script result chain, not a new execution plane.

- `core/tools/codemode/prelude.ts`: bootstrap closure isolation, emitted alias installation, immutable VM metadata and bounded local helpers. Keep actual source transport here.
- `core/tools/codemode/tool.ts`: thin worker orchestration/host result projection. If it grows beyond responsibility limits, put script lifetime/RPC ownership in local `execution.ts` and early output admission in `output.ts`; do not add vague helpers or a second sandbox runtime.
- `core/tools/codemode/nestedCalls.ts`: recording and narrow tool-value projection. Keep store adapter/ABI in existing `store.ts`/`state.ts`; E.2 source anchors and unknown persistence states must remain intact.
- `turn/nestedTools.ts` and `turn/tools.ts`: reuse ordinary permission/preparation/hooks, error monotonicity, approval/result metadata, captured signal and shared sequential policy. Put a extracted policy in `turn/execution.ts` or a clear local policy owner only if both paths truly consume it; never duplicate the tool-name list.
- `core/tools/catalog.ts` / `registry.ts`: bind codemode to the admitted composed catalog using existing discovery/generation ownership. Namespace/model metadata should enter through existing owner data, not ambient disk reads in tool.ts.
- `core/tools/codemode/declarations.ts`: consistent callable identifiers, precedence-correct declaration projection and explicit namespace contract. A small `catalog.ts` under codemode is appropriate only for an inert projection of the owning run, not a second registry.
- Tests: `core/tools/codemode/execution.test.ts`, `declarations.test.ts`, `output.test.ts` for adversarial worker contracts; `turn/nestedTools.test.ts` and existing `turn/session.test.ts` for the actual gate/history consumer; existing `core/tools/catalog.test.ts` for session contributions/discovery. Do not cram this into the unrelated InteractiveMode suite.

Bounded success requires the main agent to demonstrate actual red assertions, apply focused fixes, run the integrated focused suites serially, perform effective reversals with exact restoration, and bind current native/public-entry evidence to the final sources/build. One controlled local run must show a single codemode call performing multiple admitted tools and persisting only its selected final output (with bounded truthful nested metadata), denial/hook retry/failure/cancellation and completed-effects controls. E.3 also needs actual worker calls to generated identifiers, namespace-scoped discovery, captured model lookup and image/final-output budgets. A provider-backed run is useful only if it actually invokes this same composition; synthetic helper success is insufficient. No general VM security, deterministic replay, provider billing/image-generation parity, other-platform support, commit/push or CI acceptance follows from this bounded batch.

## Limits and follow-up evidence

These are code-derived predictions until the main agent runs red tests. No source was changed in this audit. Existing codemode tests do not establish all acceptance criteria. Direct callers of the raw definition can still use the runner's fallback without ordinary host hooks; production runTurn is gated, so do not describe that fallback alone as a production authorization bypass. Parent complete/timeout races, actual callback scheduling, worker termination and any OS effect outcome require controlled runtime evidence.

Paths above are relative to `packages/ts-shell/src/` unless prefixed `.wiki/` or `pi/`; `pi/` means the read-only `/home/wang/projects/pi` checkout. This report is a proposed bounded acceptance batch, not authorization to alter provider/auth core, defaults, package scripts, build behavior, shared docs or reference files.

## Source identity at report write

UTC: 2026-11-17T06:11:48.821610+00:00. Observed HEAD: `1285ff4a58abb64fabbb55cc5c717beb700e8623`. SHA-256 below captures the audited owners; it is not a build or immutable-workspace receipt.

| Source | SHA-256 |
|---|---|
| `packages/ts-shell/src/core/tools/codemode/tool.ts` | `569af35ce2364a9ff64cd20060ea8a02331d48c7d4b1463cbe05305ba22f8e8f` |
| `packages/ts-shell/src/core/tools/codemode/prelude.ts` | `ebf3aa9d6d280dfc6fd2aa1e0e3c7725059dec4eb314c8b4383813e128d4d122` |
| `packages/ts-shell/src/core/tools/codemode/nestedCalls.ts` | `0b09e4e862b5e7584841cef606da3d9ab5ae752845dcd2d7d3a4aa2bf22a35e4` |
| `packages/ts-shell/src/core/tools/codemode/declarations.ts` | `7337556cd42e30354228b1be862bb46f3c4c032254d997bcd8eb4c568cfb9fde` |
| `packages/ts-shell/src/core/tools/codemode/image.ts` | `38cd76c1bfd2dc999140656344c99116e65449f47a891c17ef7f56ef0833a7c5` |
| `packages/ts-shell/src/core/tools/codemode/options.ts` | `63de7175896a805503172411242e92f70f0c5c2b7a6ef70de151fc04e1a8c3d9` |
| `packages/ts-shell/src/core/tools/registry.ts` | `7b6b0a3f2ae16a152c18e61c975c970cee98d8fb53062e9f8e4ad563c0197cec` |
| `packages/ts-shell/src/core/tools/catalog.ts` | `14b4839e8556e39f418bfd362683caf76fe00523bd1ce1d3d86d0147ae86e4c8` |
| `packages/ts-shell/src/core/tools/discovery/state.ts` | `3377ea925331a741d42d9cb014b1f74fe0cc1cffe5b92fd36302d248e59be1b7` |
| `packages/ts-shell/src/turn/nestedTools.ts` | `be4c3f650ddeac8a2d0f6e9bf36bbd971d0bf36cdd82e85eefc9e6869f44cad4` |
| `packages/ts-shell/src/turn/tools.ts` | `9cd45b1b311391cd5b9a7b0b8597367e63d965c38d49e0b5eb454bdcca41be34` |
| `packages/ts-shell/src/turn/session.ts` | `5c51e7f9d2edfd349c22df995070213ad11ad94fde5e18e16009502bef22b678` |
| `packages/ts-shell/src/core/agent/tools.ts` | `3f828cb73080a28f8799431083c8e41dca5e74fd6bb5a1a7052cd79fedbde1c6` |
| `packages/ts-shell/src/core/agent/media.ts` | `52d39715886387f30da644fe783adf84caf204809ed5e9923503822bfb18aee9` |
| `packages/ts-shell/src/core/catalog/models.ts` | `ad81a43d1c62cd5ad90ee26e2687e2b7e2d14975f702931de174ec8431dea378` |
| `packages/ts-shell/src/core/tools/codemode/tool.test.ts` | `cd7cc01ff97698a857da5cfdf926dda543c6a130d4b727f32967e9762a8f8781` |
| `.wiki/refactor/upgrade/tasks.md` | `eb0feccdeb9d3b4c9b517e85bcb451d4b241f0d1e41f644cfa9844e5f1df7075` |
