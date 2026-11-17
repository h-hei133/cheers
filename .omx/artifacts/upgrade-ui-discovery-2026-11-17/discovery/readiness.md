# C.8 staged acceptance tests

Status: staged, unexecuted. These files are inert `.ts.txt` snapshots so the existing compiler-input/archive freeze is preserved. This worker ran no tests, builds, gates, providers, or NormProof and changed no production code.

Apply only after the main agent's archive is frozen:

| Staged source | Future owning test path |
| --- | --- |
| `.tmp/discovery-validation/contract.test.ts.txt` | `packages/ts-shell/src/core/tools/discovery/contract.test.ts` |
| `.tmp/discovery-validation/ranker.test.ts.txt` | `packages/ts-shell/src/core/tools/discovery/ranker.test.ts` |

The first contract file has 12 cases. The first three are expected counterexamples against the current cached per-object fingerprint, subject to actual main-agent reproduction:

- `revokes the retained SDK schema generation when the next declaration changes`
- `refuses a retained SDK schema snapshot after nested type mutation through the ordinary gate`
- `refuses the retained SDK schema prepared effect after an awaited ordinary approval`

Their setup uses actual `createAgentSession(customTools)` registration, current `preparePromptRequest`, real schema validation and/or ordinary `adaptTools` / `executeToolBatch` gates. Mutation changes only plain nested schema properties retained by the caller. No adversarial getters or implementation mocks are used. The generation case first proves that the next declaration and schema digest changed while system digest remains stable. The stale snapshot case primes validation before mutation, proves type validation responds to the new schema, then asks the old snapshot to run with arguments valid under the changed schema. The prepared case settles original preparation before holding approval, changes only its nested schema description, and requires effect refusal after that approval actually resolves.

Controls: immutable SDK definition succeeds with stable identities; changed replacement rejects its old snapshot while an unrelated old definition still runs; a fresh replacement succeeds. Three barrier-driven cases replace a definition during pending preparation, prepared-call approval or ordinary-call approval and require zero old/new effects until a new call is approved.

The integrated allowed/denied cases use `createStepFunction` with injected local response fixtures and `runTurn` with live discovery snapshots. They capture actual serialized request bodies, actual persisted search results, declaration digests, approval requests, gated effect counters and tool-result success. The search match's capability term exists only in the schema description. These fixtures are synthetic local transport evidence, not real provider acceptance or cache evidence. Search itself currently requires ordinary approval under `ask`; the fixture approves that search separately and applies the case decision only to the loaded tool.

Two visibility controls ensure disabled/hidden tools cannot be found, loaded, declared or executed through the admitted pool.

The ranker file has 10 cases: recursive references and unreachable definitions; escaped pointers and shared-reference deduplication; three union/item variants; remote-reference exclusion; identifier/plural/composed-Unicode/Chinese queries; exact normalized MCP local names versus repetition; query coverage versus a high-scoring one-word distractor; deterministic ties and result limit. The shared-reference and coverage controls are designed to fail if their compared decisions are reversed.

Suggested first serial invocation from `packages/ts-shell`, after application:

```bash
rtk env VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=2 ./node_modules/.bin/vitest run src/core/tools/discovery/contract.test.ts src/core/tools/discovery/ranker.test.ts --no-file-parallelism
```

The failure classification must distinguish SDK/bootstrap/discovery harness errors from the three intended behavioral counterexamples. If bootstrap or invocation fails first, repair the fixture without promoting that failure to a product defect. The specific red filter is `retained SDK schema`. For integrated controls alone, filter `schema-only search hit|pending|immutable|replaced definition|capability`.

After a narrowly scoped production decision and repair, combine the new files with `discovery/state.test.ts`, `discovery/evaluation.test.ts`, `core/tools/catalog.test.ts`, `core/prompts/request.test.ts`, `turn/prompt.test.ts`, `turn/tools.test.ts`, `cli/provider/step.test.ts` and `turn/session.test.ts` in the main agent's one serial process. Do not claim provider/cache/resume evidence from these local gates.

All fixture state uses `/tmp/cheers-test/discovery-contract-*` with private HOME/USERPROFILE, CHEERS_TEST_ROOT and GIT_CEILING_DIRECTORIES. Each test disposes SDK sessions, resets usage, restores mocks/env and removes its fixture root.
