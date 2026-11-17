# Codemode compiled native helper

`native.mjs` is authored only. Its author has not run it, checked its syntax with an executable tool, built anything, invoked a provider, or run gates. Root runs it serially after integrated repair, reversals and a current build:

```bash
rtk node --max-old-space-size=768 .tmp/codemode-validation/native.mjs
```

The helper writes a report-safe `.tmp/codemode-validation/native.json`. Do not infer evidence from the existence of this plan or the helper. Root must retain actual exit status, terminal receipt and source identity.

## Build, configuration and report boundaries

- `checkBuild` from `scripts/start-lib.mjs` verifies the current package build, compiler input digest and artifact manifest before the public SDK import. The helper uses `packages/ts-shell/dist/index.js` for provider sessions. Raw controls find the original declared functions in the manifest's chunks, verify each artifact hash and import its existing internal export. The initial source-path import assumption failed at setup with zero requests; its receipt is preserved. Controls do not add a new product entrypoint or claim package-export coverage.
- The build manifest, helper source and targeted product sources are hashed before execution. Build input freshness and manifest/source/helper equality are checked after the scenarios. Source changes or build replacement retire the receipt.
- Configured target extraction follows the existing read-only `.tmp/discovery-validation/native.mjs` `selectedOwner` and runtime config extraction. It retains the actual connected physical provider/model, destination, credential selection and published metadata. Its JSONC fallback is explicit in the receipt and may carry only minimal model metadata. No prices, remote capacities, context limits or vision support are invented.
- Personal configuration, auth/model files, legacy candidate locations, applicable environment file inputs and repository `.cheers.json` are hashed and rechecked. Isolated 0700 state stays under `.tmp/codemode-validation/native-state-*`. HOME/USERPROFILE/storage/marketplace/extension/plugin/log paths point into that private root; scope is explicit and local. Original hooks are not loaded into the fixture. Config/auth objects use the original selected values only in memory/private files. Private state is removed and environment values are restored in `finally`.
- Receipts contain only hashes of configured target IDs, source hashes, bounded tool/call/hook facts, booleans, counts and fixture results. They contain no credential values, authorization headers, provider destination/host, raw requests, response bodies, original config text or unfiltered model-generated results. The final terminal line is likewise report-safe.
- The request observer reuses the existing discovery helper's bounded undici `onBodySent`/response capture, compressed response envelope facts and cleanup. Only bounded request/response digests and projected declarations/tool-result facts are retained. Actual bytes are cleared. A request ceiling of 16 and finite 150-second provider scenario/480-second overall deadlines bound work; provider retries and background cache warming are disabled. Other network destinations or any request during raw controls fail the receipt.

## Two real-provider scenarios

Each public SDK session starts with dynamic discovery, only admitted read/search/load/script/custom fixture scope, ordinary `ask` approval and `allow-once`. Neither codemode nor the deferred custom schemas may appear in the initial request.

1. **Allowed**: The real provider must call schema-only `tool_search` exactly once with query `codemode`, `load:true`, wait for its declaration on the next request, then make exactly one codemode call with the supplied code unchanged. The worker checks a collision-safe `tools["fixture:effect"]` declaration, the namespace containing its colliding `fixture_effect` control, captured physical and callback-free virtual metadata, unknown-null and frozen records. `Promise.all` performs two actual builtin file reads plus one admitted deferred custom write. The output filters discarded fixture fields into a selected summary.
2. **Prehook retry**: The same worker flow uses `Promise.allSettled`. An ordinary registered `PreToolUse` hook returns retry for the custom effect. Two builtin reads still complete, the custom effect is rejected, and no effect file is written. The selected parent summary reports the rejection and preserved retry reason.

Both cases require actual observed calls, approved parent/nested custom admission, native pre/post hooks, exact selected output, completed nested-call records and a completed SDK query. The observer must see changed schemas with stable system identity after schema loading, and only the parent result in later provider feedback. Discarded read fields and nested tool-result IDs must not appear in wire feedback or retained parent history. The colliding control and logical route callbacks must have zero invocations.

The custom tool uses actual `fs.promises.writeFile` with `wx` on a fixed isolated destination. This records an authorized native file effect; it does not replace the production builtin write adapter. A separate compiled control exercises the real builtin write path.

## Six compiled controls with zero provider requests

1. Real builtin `read` and `write` through `adaptTools`, `createToolHooks` and `executeToolBatch`, plus OS readback and nested record validation.
2. An ordinary deny rule rejects a custom nested effect under `Promise.allSettled`; effect count remains zero and destination remains absent.
3. A real completed builtin write followed by a script error preserves the file and truthful successful nested call record while retaining the parent failure.
4. Actual Linux ffmpeg media decoding of a complete PNG through the real builtin read, `await image(await tools.read(...))`, normal tool batch and outer model feedback. The shared `inspectImage` must verify a 1x1 JPEG whose encoded bytes differ from the source PNG. No synthetic `readMedia` seam is used. Missing native decoder/platform prerequisites are classified as unavailable evidence, never a passing image route.
5. Script timeout with an effect held in the actual nested prehook boundary retires its signal, waits for release/settlement and leaves zero effects/files.
6. Parent cancellation of the same boundary retires only the child lifetime, drains the pending boundary and leaves zero effects/files. Parent-aborted state is checked separately from the timeout control.

The lifecycle observer wraps an existing compiled HookDispatcher to hold one prehook, preserving normal native dispatch. It observes cancellation and releases the controlled boundary in `finally`; it never injects provider responses.

Provider image acceptance is explicitly unrun in this bounded helper. The native decoded-image route is tested through compiled raw control and reports the configured target's captured vision declaration separately. A future real-provider image case needs its own observed request/result evidence. Rich classifier/image-generation dispatch, live platform matrices, heap peaks, billing and full parity remain outside this receipt.

## Failure classification

The helper records stage and controlled failure code only. Provider quota/auth/network/protocol outcomes remain separate from native route/harness failure. Model deviation from the exact call/script contract is classified as provider behavior or probe contract, not proven product failure. No retries manufacture success. Successful raw cases remain explicit if a subsequent provider case fails. Cleanup, original-input mutation, source churn or build churn makes the overall receipt fail.
