# Idle tool discovery and transcript acquisition

The existing Git commit-intent owner used to acquire the current session before checking whether a host-armed intent existed. Foreground tool projection runs while typing, so this reread the current transcript even though no commit tool could be offered. The fix returns an empty Git tool list before acquiring history when unarmed. Armed discovery still reads the authoritative current prompt and checks session, cwd, role, source and exact intent ID.

`regular-baseline.json` and `fullscreen-baseline.json` bind the original Node CLI observations to the preceding build. Three ordinary draft characters and their preview updates produced 21 real tool-list calls and 21 synchronous transcript reads inside those calls in each mode. `regular-fixed.json` and `fullscreen-fixed.json` bind the same probe to `build.json`: 21 calls, zero transcript reads from that path and two remaining startup reads in each mode. Counts establish avoided acquisition in this small fixture; they do not establish user-scale latency, heap, physical I/O totals or global absence of transcript reads.

The probe uses one saved session with one message per mode, isolated home/profile/project, synthetic offline configuration, a 768 MiB heap, a 45 s deadline and 2 MiB output limit. It waits for the actual prompt and sends three keyboard characters through the original Node CLI. `observe.mjs` delegates every real tool projection, render, synchronous read and turn event, attributing transcript reads only while the existing synchronous intent method executes. No replacement routing or permission decision is injected. Config/model bytes, zero requests, exit zero and cooked input restoration are checked; scratch is removed in finally.

`validation.json` records the initial serial main-agent run: five static gates, 32 tests in the intent and native operation files, and four filtered runtime-preview tests. The 24 existing operation tests include native Git approval/refusal, changed snapshots, hooks and write readback. New focused cases prove no unarmed acquisition, all armed identity gates, denial retirement and actual foreground projection. The broad preview file was filtered, not fully run. `final-validation.log` records two reversals, restored intent eight tests and idle preview one test, then the TypeScript build, AST owner audit and final CLI probes, all serially. The intent owner stays at five named callables.

`reversal.mjs` moves history acquisition back before the guard, causing the explicit no-history regression to fail, then separately removes the armed source/intent predicates, causing identity assertions to fail. Each case restores exact bytes in finally. `reversal.json` and the two failure logs retain hashes and outcomes. The eager-read reversal produces the deliberately thrown history-acquisition error; it is not misreported as an assertion failure.

No full suite, parallel verification, subagents, real provider, executable build, NormProof judge, independent review or large PTY history was run. No Git permission or write plan was widened. Real large-directory performance and broader Phase 20 acceptance remain unverified; the active goal remains open.

From repository root, run serially:

```sh
rtk proxy node .omx/artifacts/phase20-addition-idle-tools/reversal.mjs
rtk env NODE_OPTIONS=--max-old-space-size=2048 npm run build:ts
rtk proxy node .omx/artifacts/phase20-addition-idle-tools/audit.mjs
rtk proxy node .omx/artifacts/phase20-addition-idle-tools/cli.mjs regular fixed
rtk proxy node .omx/artifacts/phase20-addition-idle-tools/cli.mjs fullscreen fixed
```

Baseline mode is intended only for the preceding eager-read source/build; the fixed version should fail its expectation of positive idle transcript reads.
