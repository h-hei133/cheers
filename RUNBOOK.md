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
| Provider readiness smoke | `npm run verify:provider-readiness:real` | Explicit opt-in real-provider readiness check using isolated test/runtime homes. | Skip without opt-in; otherwise pass, provider-network, config/auth/unsupported, unknown, or product regression. |
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

### Current main-path gate layering

Use these commands as the current default verification stack for main-path
work:

| Layer | Command | Gate status | Purpose |
| --- | --- | --- | --- |
| Golden CLI main path | `npm run test:gate:golden-main-path` | Required stable gate | Fast synthetic CLI baseline for the user-visible main path. |
| Real user capabilities | `npm run verify:real-user-capabilities` | Required stable MVP gate for current dogfood mutation evidence | Synthetic selected-workspace existing-file single-file update. Broader real-provider, protected consistency, release, and backlog cases require explicit `--tier=...`. |
| Real single-file provider smoke | `npm run verify:real-user-capabilities:real-single-file` | Explicit opt-in candidate evidence | Real provider model turn plus isolated selected-workspace existing-file single-file update. It is not part of default MVP, and it does not enable create/add/delete/move/multi-file/rollback or broader `apply_patch`. |
| Focused regression guard | `npm run test -w packages/ts-shell -- <file> -t "<case>"` | Required when the current bounded slice added or changed a focused guard | Proves the exact behavior being closed without treating legacy wide tests as release blockers. |
| Release core | `npm run verify:release:core` | Broader deterministic release gate | Runs the hard gate set listed above; use before release handoff or when changing shared CLI/runtime contracts. |

### Add File classification boundary

The current apply_patch surface can classify `*** Add File` patches in a
synthetic/no-write path, but it cannot create files. This classification is
diagnostic candidate/backlog evidence only:

- selected-workspace single-file Add File is reported as create/add not enabled
- existing target, missing parent directory, outside-workspace target, and
  multi-file add each remain blocked with no write intents
- `changedFiles=[]`, `writeIntents=[]`, `willWrite=false`, and no writer success
  claim are required invariants
- default MVP remains selected-workspace existing-file single-file update only
- broader apply_patch, create/add writing, delete/move, multi-file, rollback,
  real-provider create smoke, provider/auth flow, and CLI/session schema remain
  out of scope

`packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts` full-suite
is not a current main-path gate. It is a broad historical contract corpus used
for attribution and targeted focused guards. Running it in full is allowed for
triage, but a red full-suite result must be classified before it is treated as a
product regression.

Current known full-suite status for `runMvpIntegratedFlow.test.ts`:

- 121 total tests
- 69 failing legacy or wide-contract assertions
- focused interrupted goal persistence guard passes:
  - `npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "keeps original bugfix goal through interrupted continue verification evidence"`

Known failure buckets in that full suite:

| Bucket | Count | Classification |
| --- | ---: | --- |
| Provider role, approval, stream, and terminal old-contract assertions | 10 | Historical contract debt, not a current gate by itself. |
| Read/write/repo/chat intent routing assertions | 19 | Wide orchestration contract debt; use focused tests for changed behavior. |
| Edit, mutation, verification, and patch precision assertions | 14 | Historical mutation/verification contract debt; do not repair opportunistically from unrelated rounds. |
| Weak/no-cue follow-up lineage assertions | 4 | Follow-up lineage contract debt; only touch during a bounded follow-up slice. |
| Reflective, approval-memory, and migration rebasing assertions | 17 | Session/reflective recovery contract debt; not part of the default main-path gate. |
| Explicit session-id, blocker-to-fix, and verify next-step continuation assertions | 5 | Continuation contract debt; use focused guards for current work. |

When a future change touches `runMvpIntegratedFlow.ts`, prefer this order:

1. Run the focused guard for the changed behavior.
2. Run `npm run verify:real-user-capabilities` for the MVP selected-workspace update gate; use `--tier=candidate`, `--case=real-selected-workspace-single-file-update`, or explicit real-provider smoke flags only when the behavior affects those non-default tiers.
3. Run `npm run test:gate:golden-main-path`.
4. Run the full `runMvpIntegratedFlow.test.ts` only for attribution or when intentionally working down that legacy corpus.

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
- Real-provider readiness smoke uses an isolated runtime home under
  `PRIVATE_AGENTS_TEST_ROOT`; the script sets child `HOME` and `USERPROFILE`
  to that isolated runtime home.
- Real-provider readiness smoke does not use `PRIVATE_AGENTS_REAL_HOME` as a
  runtime home and does not read real user provider config directories.
- Do not copy provider credentials into repo files, logs, reports, or runtime
  homes.

### Real provider readiness smoke

`npm run verify:provider-readiness:real` is an explicit opt-in smoke for the
real-provider readiness boundary. It is not part of default build/test or the
CLI baseline.

Default and self-test behavior:

- `npm run verify:provider-readiness:real`
  - skips with exit 0 unless `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1` is set
  - does not load provider credentials and does not contact a provider
- `npm run verify:provider-readiness:real -- --classification-self-test`
  - runs local classification/redaction/env-contract checks only
  - does not load provider credentials and does not contact a provider

Opt-in contract:

- required:
  - `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1`
  - `PRIVATE_AGENTS_TEST_ROOT=<isolated temp root>`
- provider selector:
  - `PRIVATE_AGENTS_REAL_PROVIDER=<provider>` or
    `PRIVATE_AGENTS_PROVIDER=<provider>`
  - supported selectors: `openai`, `openai-compatible`, `google`,
    `antigravity`, `claudecode`
  - `siliconflow`, `deepseek`, and `compatible` are treated as
    `openai-compatible`
- credentials and provider details may come from explicit env or the approved
  provider env file loaded silently:
  - `PRIVATE_AGENTS_REAL_API_KEY` or provider-specific API key env
  - `PRIVATE_AGENTS_REAL_BASE_URL` / `PRIVATE_AGENTS_REAL_MODEL` for
    OpenAI-compatible style providers
  - common aliases such as `OPENAI_API_KEY`, `OPENAI_COMPATIBLE_API_KEY`,
    `BASE_URL`, and `MODEL`

Provider env loading:

- The only approved provider env file for this smoke is
  `/home/wang/.private-agents-real/provider.env`.
- Load it silently in the command environment; never print, cat, echo, copy,
  record, or summarize its contents or any env values.
- Do not read any other files under `/home/wang/.private-agents-real`.

Example Linux/WSL shape:

```sh
set -a
. /home/wang/.private-agents-real/provider.env
set +a
PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 \
PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/provider-readiness-real \
npm run verify:provider-readiness:real
```

Failure classification:

- missing config or missing key exits 3
- auth failures such as 401/403 or invalid key exit 3
- network/proxy/timeout failures exit 2
- unknown provider readiness failures exit 1
- product regression exits 1

### Real single-file capability smoke

`npm run verify:real-user-capabilities:real-single-file` is a candidate-only,
explicit opt-in smoke for real-provider dogfood of the current MVP mutation
boundary.

Required boundary:

- one real-provider model turn may produce exactly one `apply_patch` block
- the write route may update only existing `src/app.ts` in an isolated temporary
  selected workspace
- the fixture contains no create/add/delete/move/multi-file/protected composite
  requirement
- post-write verification must prove the target file changed from `draft` to
  `ready` and no other file was added, removed, or changed
- provider/preflight, model output, unsupported patch, verification-blocked, no
  mutation, and post-write verification failures must remain separately
  attributable

On Linux/WSL, run it only with explicit real-provider opt-in and isolated test
homes. If `provider.env` is used, load it silently in the command environment;
never print, copy, log, or summarize provider secrets or values. `--list` and
`--dry-run` show the case metadata without touching the real provider.

## Suggested debug reading order

1. `packages/ts-shell/src/entrypoints/cli.tsx`
2. `packages/ts-shell/src/core/shell/sessionRuntime.ts`
3. `packages/ts-shell/src/core/query/queryLoop.ts`
4. `packages/ts-shell/src/core/query/resultMapper.ts`
5. `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
