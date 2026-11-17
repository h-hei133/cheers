# G7/G8 output and model metadata worker tests

## Ownership and execution

Authored only `core/tools/codemode/output.test.ts` and `core/tools/codemode/models.test.ts` under `packages/ts-shell/src/`, plus this plan. Other agents own production changes and existing tests. This lane has not executed tests, builds, probes, providers, compilers or verification gates. Root owns the serial red, repair and green observations and must bind them to current source bytes.

## G7: 18 cases in output.test.ts

- Three actual-worker cases combine the status, text/console/top-level return and truncation notice within the conservative UTF-8 feedback limit of 256 bytes for `max_output_tokens:64`. Their source values stay below the worker's 1,024-byte intermediate allowance. Multibyte text must not introduce U+FFFD. `metadata.outputNotice` must remain nonempty, bounded and visible in published feedback.
- Two actual-worker cases exceed the intermediate allowance through multibyte `text()` and top-level return. A bounded failed outcome must preserve its failure status and output/buffer/limit cause; a safely truncated success must preserve its output notice.
- One valid control retains two complete PNGs, verifies them with the shared `inspectImage`, checks count/encoded totals, and follows images through `createToolResultMessage`.
- One count overflow emits nine complete PNGs and retains four, with the existing four-image/4MiB omission notice in bounded feedback and metadata.
- One aggregate-byte overflow repeats a complete 1x1 GIF with a valid 1,600,000-byte comment extension. Each encoded image fits 4MiB, while two exceed the budget before the count ceiling. Only the first is retained, with the same omission notice. Comment extension subblocks preserve the actual GIF frame and trailer; these are not signature-only or padded invalid bytes.
- One individually oversized control uses a complete GIF with a 3,200,000-byte comment extension. `image()` must reject the oversized RPC before retention, let the script catch that rejection, and accept a valid PNG successor. This prevents success caused solely by a later projection dropping invalid retained media.
- Seven rejection/control pairs cover signature-only PNG/JPEG/GIF/WebP and forged MIME in an object, data URI and image_url wrapper. Each rejected call is caught in the actual worker, followed by a complete image whose exact retained data and MIME are checked.
- One real builtin text-file read uses the default execution service through `adaptTools` and the worker. Its nested result remains a string usable with `split()` and retains truthful nested-call metadata.
- One real builtin image read uses `createReadToolDefinition`, `adaptTools`, the actual worker and `createToolResultMessage`. The injected `readMedia` seam returns a synthetic complete PNG after `inspectImage`; builtin routing, the gate, cancellation signal, result transport and publication remain native. Image-bearing results expose inert `{output, images}` and support both `image(item)` and `await image(await tools.read(...))`. This is transport evidence; it does not establish native ffmpeg decoding, platform availability or real-provider image acceptance.

The bridge currently has a shared 1MiB RPC cap. To permit valid images large enough to exercise the encoded aggregate budget, image transport needs a separately bounded allowance while ordinary tool-argument frames retain their small cap. Per-image rejection must return a catchable RPC error rather than prematurely end the worker, and aggregate omission must happen before output image retention.

## G8: four cases in models.test.ts

The tests pass an optional native `modelCatalog?: ReturnType<typeof sessionModelCatalog>` context via a temporary type intersection until the production port is available. The supplied catalogue is authoritative even when explicitly empty.

- Captured physical and virtual entries remain stable across two different isolated ambient catalogue cache fixtures. Flat `models.list()` and provider-filtered lists agree with exact `models.get()` records; unknown lookup returns null. Known reasoning false remains false and unknown reasoning remains absent/null. Physical modalities, cost, limits and effort metadata are retained, and virtual metadata comes from its existing owner without invoking the route callback.
- An explicitly empty captured catalogue remains empty despite a real isolated ambient fixture reader control.
- Worker mutation attempts against model IDs, nested cost/limits, input/output arrays, effort/tier arrays, virtual metadata and list arrays cannot forge future list/get results. All retained record/nested objects are frozen. Host fixture data also remains unchanged.
- Synthetic non-contract private fields on the physical provider/model detect unsafe metadata spreads. Public records contain no credentials, provider endpoint/auth slots, executable callbacks or virtual route capability. No real secret is read, supplied or printed.

Ambient fixtures are written only under isolated `/tmp/cheers-test/` HOME and USERPROFILE. The fixture asserts its path remains under that root, verifies the actual ambient loader sees the control entry, and unregisters virtual contributions after each case. The codemode executions use no session ID and avoid store/session fixture dependence.

These tests establish list/get metadata transport only. They do not implement or claim classifier, image-generation or other rich model dispatch parity.

## Expected pre-repair failures and limits

The original final-output formatter slices UTF-16 characters with a minimum fragment size exceeding the small limit, appends top-level returns separately, and omits truncation metadata. Original image validation checks magic bytes only, ignores declared MIME, and appends images without the shared aggregate budget. Original nested result transport returns text only. Original models use ambient physical entries, coerce absent reasoning to false and freeze only the outer list. These are behavioral red expectations, not recorded test results.

Root must classify compilation/discovery failures separately from behavioral failures and record actual terminal test counts. The tests have not been run by their author. Live providers, native media decoder/platform evidence, heap measurements and full model-dispatch parity remain outside this lane.
