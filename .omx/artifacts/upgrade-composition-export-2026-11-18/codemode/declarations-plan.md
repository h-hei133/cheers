# Codemode declaration regression tests

Status: written, not executed. Only the new `packages/ts-shell/src/core/tools/codemode/declarations.test.ts` and this plan are owned by this lane. No production/shared docs/HANDOFF edits. No tests, compiler invocation, build, gates, installs, probes, providers or NormProof ran. The TypeScript compiler is invoked only inside the future test execution by the main agent.

## Minimum deterministic identity policy

1. Every raw tool name remains callable by `tools["raw-name"]`.
2. A sanitized identifier is callable when it identifies exactly one raw tool and is not the raw name of a different tool. Existing reserved-word/leading-digit transformation remains the candidate mapping (`class` → `class_`, `9lookup` → `_9lookup`).
3. Ambiguous aliases never choose a tool based on registration order. If no raw tool owns the alias, the ambiguous member is unavailable. If a raw tool owns it, the member calls that raw owner, and the other tool's declaration uses the bracket expression.
4. Declarations for an ambiguous or shadowed alias show `tools["raw-name"]`; unique identifiers show `tools.identifier`. `describeTool` resolves unique aliases and raw names to the same tool declaration. The collision policy must be based on the captured whole callable catalog, not an isolated name.
5. MCP namespaces use `mcp__<server>` as the canonical spelling. Thus `github` and `github_enterprise` are distinct even though one is a prefix of the other. Existing aliases such as `mcp_github` can be added for compatibility only if they remain unambiguous; these tests do not require such an alias.

## Coverage written

- Four parameterized actual-worker declaration consumers: ordinary identifier, punctuation (`docs:lookup`), reserved word (`class`), leading digit (`9lookup`). The test reads `describeTool`, extracts its callable expression, invokes it and the raw bracket lookup, verifies returned fixture identity and recorded raw nested tool names, then checks alias lookup equality.
- Three parameterized actual-worker collision scenarios, each with both catalog orders: two names mapping to `my_tool`; a punctuation name colliding with existing raw `my_tool`; and keyword alias `class_` colliding with a raw tool. Assertions verify the emitted expression's actual dispatch and raw lookup before checking bracket fallback, so a wrong name is a behavior failure rather than only a string comparison.
- Three parameterized strict TypeScript consumers: union first in allOf, union last, and local-$ref alternatives in allOf. Each first proves that the actual schema validator accepts `{a,c}`/`{b,c}` and rejects `{a}`/`{b}`/`{c}`. The generated sample's argument type is inserted into a virtual in-memory `.ts` consumer; valid calls must type-check and schema-invalid calls have `@ts-expect-error`. A lost intersection produces unused-directive diagnostic 2578 and a failing assertion. Missing `c` cannot pass silently. The library is real TypeScript, strict/noEmit/types:[], no shell compiler and no output files.
- One strict TypeScript control: a union sibling remains independent of the other branch's intersection. This protects against an overbroad parenthesization/association fix accidentally applying `c` to both branches.
- One actual-worker/server-descriptor test through `createCoreToolRegistry`: namespace membership, same-topic BM25 search under a namespace, unknown namespace/search controls, an underscore-containing/prefix-related server, and actual selected-tool dispatch to the fixture MCP gateway. It never reaches a network or provider.

Total declared test cases: 12 (worker collision cases each inspect two registration orders internally). Test temporary state follows `/tmp/cheers-test/`, isolated HOME/USERPROFILE/CHEERS_TEST_ROOT/GIT_CEILING_DIRECTORIES and real `SessionManager` creation. Shared execution workers are not started in this writing lane.

## Main-agent red validation

Run the new file with the existing package Vitest config in the main agent's one serial validation lane. Capture genuine assertion failures before editing production. The strict consumer controls should be green; unique punctuation/keyword/digit aliases, collisions, intersection precedence and namespaces are expected source-derived failures until reproduced. A setup/parser/library failure is not red behavior evidence.

The code remains on the current `renderToolSample(tool)` API; the worker is the context-sensitive entry for collision policy. A production extension can pass a captured alias/catalog mapping into rendering without changing these consumer tests. If result return-type declarations gain a media union later, adapt only the extraction of the declaration argument type to that contract; do not weaken schema rejection checks.

## E.3 scope still requiring explicit resolution

The tests cover the declared metadata/discovery surface, not classifier or image-generation model dispatch. Canonical E.3 only says “models API”, while current Cheers advertises list/get and pi also has getAvailableOfType/getModelOfType/classify/generateImages. Main task needs an explicit acceptance decision before treating metadata list/get as full models parity or expanding provider/auth scope. No models policy is implicitly authorized by these declaration tests.

A richer namespace description/instructions payload is allowed; the assertions require correct name/membership and dispatch, not an exact metadata schema. The worker remains node:vm + Worker; alias or namespace fixes do not imply general VM security or deterministic replay. Existing branch-store E.2 semantics and C.8 catalog generation guards are outside this test-writing lane and must remain owned by their current modules.

## File identity

UTC: 2026-11-17T07:29:13.402524+00:00

Test SHA-256: `ee25a5a38e89693ac1499252715a9cc011b6ef80f85fa1a2f50409c878b2bba8`
