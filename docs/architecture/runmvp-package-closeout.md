# RunMvp Package Closeout

Route: `docs/agent-routes/route144-runmvp-package-closeout.md`

## Scope

Route 144 closed the remaining `runMvpIntegratedFlow.test.ts` failures and then
swept `packages/ts-shell` package tests. It fixed product/harness drift without
provider live calls, browser capability expansion, edit expansion, broad shell
allowlist changes, permission weakening, schema/CLI/dependency changes, or a
broad `runMvpIntegratedFlow.ts` rewrite.

Starting baselines:

- full `runMvpIntegratedFlow.test.ts`: `144 passed / 7 failed`
- package sweep: `2017 passed / 30 failed / 1 skipped`

Ending baselines:

- full `runMvpIntegratedFlow.test.ts`: `151 passed`
- package sweep: `2051 passed / 1 skipped`

## RunMvp Failure Decisions

| Test family | Classification | Decision |
|---|---|---|
| explicit escalation callback | product drift + stale terminal expectation | fixed generic `continue` verify-continuation misrouting so approval callback is invoked; rebaselined approval-denied to recoverable `stopped` |
| default transcript role expectation | stale expectation | rebaselined to current internal `planner` -> `coder` transcript while keeping user output free of visible role labels |
| legacy resume role normalization | obsolete scenario | rebaselined cyclic legacy planner handoff to truthful `stopped_cycle` |
| git-aware change set attribution | product drift | added git-aware pre/post dirty attribution for attempted mutation results |
| provider mock reviewer turn expectations | harness drift | rebaselined no-write inspect prompts in real-provider mode to remain provider-free; no live calls or provider config reads |

## Package Sweep Repairs

| Cluster | Classification | Decision |
|---|---|---|
| recovery `targetPathBase` undefined crash | product drift | `applyShellSubstrateTransition` now falls back to `projectRoot` for legacy runtime contexts that lack `targetPathBase` |
| sandbox bare-command escalation | product drift | bare executable names such as `node` are now treated as command names that require escalation, while path-like workspace-local executables remain boundary checked |
| recovery repeated-handoff tests | stale harness expectation | tests now consume explicit `autoResume` payloads before executing continuation, matching the current `/resume` boundary |
| provider trace e2e | stale harness expectation | current tool-dispatch trace path asserts orchestration/tool runtime and explicitly no provider client |
| slash `/browser` sidebar | stale text expectation | rebaselined to current browser capability summary while preserving no browser/MCP launch claim |
| CLI print write surface | stale terminal expectation | rebaselined skipped mutation verification to `stopped`, not false success |
| browser scenario/report wording | stale harness expectation | rebaselined blocked runner and playwright-local report summary wording |
| browser CLI scenario timeouts | harness budget drift | raised timeouts only for concrete long-running CLI child-process scenarios; assertions and safety checks remain intact |
| browser cache multiprocess busy-lock scenario | harness timing drift | lock-holder fixture now exposes ready/release markers so compact reliably runs while the explicit lock is active under package-level parallel load |
| sandbox audit assertion | harness flush drift | audit test now waits for required audit entries, not just file existence, before asserting permission/escalation logging |

## New / Updated Owners

- `packages/ts-shell/src/orchestration/gitChangeSetAttribution.ts`
- `packages/ts-shell/src/orchestration/gitChangeSetAttribution.test.ts`
- `packages/ts-shell/src/core/shell/runtimeContext.ts`
- affected runMvp, recovery, trace, slash, CLI, and browser harness tests

## Validation Evidence

- Focused git attribution tests: `2 passed`
- Focused Route 144 runMvp repairs: `7 passed / 144 skipped`
- Full `runMvpIntegratedFlow.test.ts`: `151 passed`
- Focused runtime context and recovery tests: `7 passed` and `5 passed`
- Focused sandbox/tool permission tests: `22 passed`
- Focused slash/trace/CLI stale-surface tests: `1 passed`, `2 passed`, `1 passed`
- Focused browser harness tests: `38 passed`
- Focused final package-stability tests: `12 passed`
- Full `packages/ts-shell` sweep: `2051 passed / 1 skipped`
- ~~`verify:edit-capability-closeout`~~ (removed 2026-09-17): passed (`58 passed`)
- `verify:result-contract`: pass
- `build -w packages/ts-shell`: pass
- `git diff --check`: pass

## Remaining Package Failures

None in the final package sweep.

## Next Action

No failure-driven Route 145 is required from the package baseline. The next route
should be selected from product value, not from remaining red tests.
