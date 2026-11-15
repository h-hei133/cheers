
## Disabled tool fixture

The first integrated run passed 83/84 tests. The disabled case supplied disabledTools to RuntimeConfigOverrides, which does not declare that field; CONFIG_FIELDS accepts it from project/user documents, not override source. getRuntimeConfig therefore did not disable bash. Classified as harness/setup drift. The fixture now writes the supported isolated project configuration and asserts the resolved disabledTools contains bash before calling the same production RPC path. No production config or gate changes were made for this failure.

## Broader formatter command

The five required static gates passed, but a mistakenly broader npx biome check then reported 3107 formatting/assist errors across the source tree. The repository gate is npm run check:lint. No automatic fixes or source formatting changes were made. Keep broad-format-check.log as a wrong-command result, rerun the actual required lint gate with the serial verification chain.

## Test discovery scope

The review-green invocation supplied a nonexistent core/shell/command.test.ts; Vitest discovered 3 suites/27 tests. It does not prove that nonexistent target. Local-command ownership is exercised by the composed RPC fixture and existing runtime suites.

## Extracted shell factory type contract

The first build failed TS2322: extracted execute lost the original async declaration while background launch can return a synchronous ToolExecutionResult. Classified as product extraction error. Restored async on the factory execute method to retain ToolDefinition Promise contract and original registry behavior. No cast or interface weakening.

## Native summary fixture

The first two current-build CLI probes passed permission deny/disabled, success/nonzero native execution and actual prompt body inclusion/exclusion. Explicit compact correctly returned nothing/fits-budget because the fixture history fit the recent-history budget, with no summary POST. This was a fixture coverage failure, not a product compact failure. The next driver uses an 8 KiB native shell sample and 80-token recent-history budget to exercise a real summary request. Prior receipts and drivers retained.

The third sample enlarged only the oldest custom message, while the compaction cut scans from the newest message down to index 2. The recent tail still fit 80 tokens. The next fixture enlarges the actual user prompt so the legal cut retains a bounded recent tail and condenses the earlier shell messages. Product behavior unchanged.

## Native export observer

Fourth/fifth CLI probes completed actual manual summary (two loopback POSTs total) and confirmed included shell data reaches the summary while excluded report text does not. The observer then searched raw HTML text even though the established export embeds a base64 JSON payload. Changed only the probe to decode DATA before testing report retention; preserved both failed receipts.

The sixth export observer used the template-test placeholder DATA instead of the generated public session-data element. Corrected only this selector from actual template constant; no product change.

## Native artifact path observer

Seventh/eighth probes had successful native 192 KiB combined capture, truncation metadata and artifact://0. Their observer incorrectly required .txt, while the established text artifact format is .log. The ninth current-build run removed that assumption, read the actual artifact and verified exact combined bytes and digest; all later reopen/fork/cancel/EOF stages passed. No product code was changed for native-probe observer failures.

## Configured CLI setup

The initial configured probe imported a non-public dist/config/runtimeConfig.js path, absent in the generation-based build. It failed before reading credentials or launching a provider request. Changed probe to the public current dist/index.js export; zero provider calls in this setup failure.
