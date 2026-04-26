# Private Coding Agents Rewrite Runbook

## Rollback

- Disable Rust execution path with `DAEMON_ENABLED=0`
- Re-run `npm run build -w packages/ts-shell`

## Runtime shape (current)

- **TypeScript control plane**: shell/session/orchestration/recovery/permission UX/MCP routing/output contract
- **Rust execution plane**: command execution, timeout/cancel, sandbox preflight
- **contracts boundary**: TS↔Rust payload and lifecycle semantic compatibility

## Provider and connection command baseline

- Provider onboarding/control command is `/connect` (not `/auth`)
- Validate active connection state before provider-dependent tasks

## Output contract (compact vs verbose)

### Compact (default user view)

- answer-first rendering
- planner-phase internal text suppressed
- minimal result contract:
  - `Result: ...`
  - `Task: ... | Changed: ... | Verify: ...`
  - optional `Next:` / `Notes:`

### Verbose (developer view)

- lifecycle details remain visible:
  - tool/approval/retry diagnostics
  - full coding result block and verification details

## Interactive shell UX contract

- each live turn should preserve clear boundary in interactive path:
  - `=== Turn N ===`
  - `=== End Turn N ===`
- avoid overlapping prompt submissions while one turn is in-flight

## Transport behavior baseline

- `--print`, stdin, replay, interactive all route into shared turn execution backbone
- stdin is stream-first and supports sequential multi-prompt batch behavior

## Known limitations

- true live TTY automation in this environment is limited; local manual interactive test is still required
- execution success still depends on model/tool behavior; output contract does not imply guaranteed file mutation

## Verification commands

- `npm run build -w packages/ts-shell`
- `npx tsx src/entrypoints/cli.tsx --project <path> --print "<prompt>"`
- `Get-Content <prompts.txt> | npx tsx src/entrypoints/cli.tsx --project <path>`
- `npx tsx src/entrypoints/cli.tsx --project <path> --replay-file <replay.txt>`

## Local release/debug operator guide

This section is the command index for local release gates and artifact triage.
Use it when taking over a run, classifying a gate failure, or deciding whether a
failure is product code, provider/network, or local environment.

### Command classes

| Class | Command | When to run | Failure meaning |
| --- | --- | --- | --- |
| Doctor/env gate | `npm run verify:doctor` | First command on a new machine, before diagnosing product regressions. | Local environment, working directory, home, toolchain, or provider config is not ready. |
| Deterministic hard gate | `npm run verify:release:core` | Default local release check before handing off changes. | Product regression or local config failure; it should not depend on provider network. |
| Real-provider smoke gate | `npm run verify:release:smoke` | After core passes, when checking real-provider readiness. | Provider pass, network inconclusive, config failure, or product regression. |
| Provider readiness smoke | `npm run verify:provider-readiness` | Focused real-provider entry check using `D:\Test\home-sf`. | Same taxonomy as smoke, with provider/home/config evidence. |
| Evidence inspector | `npm run evidence:inspect -- --home <home> --latest` | After a run produced session artifacts, or after a gate points to a session/project. | Prints read-only artifact summary; `artifact-status=degraded` means evidence is incomplete, not repaired. |
| Failure handoff | `npm run failure:handoff -- --log-file <path> --gate <gate> --command "<command>" --exit-code <code>` | After capturing a failing gate log and needing a compact handoff. | Produces a redacted triage summary; exit 0 means the handoff printed, not that the failed gate passed. |

### Release core contents

`npm run verify:release:core` is the deterministic hard gate. It currently runs:

1. `verify:doctor`
2. `verify:permission-memory`
3. `verify:rust-execution:env`
4. `verify:rust-execution`
5. `verify:session-lifecycle`
6. `verify:query-orchestration`
7. `verify:cli-entry`
8. `verify:mcp-routing`
9. `verify:result-contract`
10. `verify:workspace-safety`
11. `verify:evidence-artifacts`

Real-provider smoke is intentionally not part of release core.

### Exit code taxonomy

| Exit code | Class | Meaning | Next action |
| --- | --- | --- | --- |
| `0` | pass | The command completed its own contract. | Continue to the next gate or handoff. |
| `1` | product-regression | The environment was usable, but a product assertion or output contract failed. | Capture the log, run `failure:handoff`, then use `evidence:inspect` if a session/project pointer exists. |
| `2` | provider-network-inconclusive | A real-provider smoke could not prove product correctness because provider/network was unreachable or timed out. | Check provider/network reachability and rerun smoke; do not classify as product regression yet. |
| `3` | config/environment failure | Node/npm/pnpm/cargo/rustc, repo root, home, provider config, or credential preconditions are wrong. | Run `verify:doctor`, fix local setup/config, then rerun the focused gate. |

### Shortest failure triage path

1. If any gate fails, first run `npm run verify:doctor`.
2. Capture the failing command output to a local log.
3. Run `npm run failure:handoff -- --log-file <log> --gate <gate> --command "<command>" --exit-code <code>`.
4. If the handoff prints `evidence-inspector-command=...`, run that exact command.
5. If the failure class is `config-failure`, fix environment/config before changing product code.
6. If the failure class is `provider-network-inconclusive`, rerun smoke only after provider/network is reachable.
7. If the failure class is `product-regression`, inspect the focused gate markers and session artifacts, then fix the product path.

### Artifact inspection quick starts

- Latest synthetic session:
  - `npm run evidence:inspect -- --home D:/Test/pca-home-synth --latest`
- Latest session for a project:
  - `npm run evidence:inspect -- --home <home> --project <project-root>`
- Known session id:
  - `npm run evidence:inspect -- --home <home> --session-id <session-id>`
- Exact artifact directory:
  - `npm run evidence:inspect -- --session-dir <session-dir>`

The inspector is read-only. It may report `artifact-status=degraded` for missing
or partial evidence. That is a diagnostic state, not a repair operation.

### Home and mode rules

- Synthetic gates use `D:\Test\pca-home-synth` with `PRIVATE_AGENTS_PROVIDER_MODE=synthetic`.
- Real-provider smoke uses `D:\Test\home-sf` as both `HOME` and `USERPROFILE`.
- Do not create a third home.
- Do not copy or configure provider credentials outside `D:\Test\home-sf`.

## Suggested debug reading order

1. `packages/ts-shell/src/entrypoints/cli.tsx`
2. `packages/ts-shell/src/core/shell/sessionRuntime.ts`
3. `packages/ts-shell/src/core/query/queryLoop.ts`
4. `packages/ts-shell/src/core/query/resultMapper.ts`
5. `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
