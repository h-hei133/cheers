# Live TTY Limited Dogfood Manual Checklist

This checklist standardizes bounded human validation of the live interactive CLI
experience. It is development-only evidence. It is not a default release gate,
not broad release readiness, and not external MCP readiness.

Use this checklist after deterministic gates have passed. Do not use it to add
capability, weaken default gates, or convert manual observations into product
readiness claims.

## Evidence Classes

| Class | Meaning | Required for deterministic release? |
| --- | --- | --- |
| Deterministic gate | Existing automated `rtk npm run ...` checks listed below. | Yes, when closing this route. |
| Manual live TTY observation | Human-observed terminal session through inherited stdin/stdout TTY. | No. Records UX evidence only. |
| Optional real-provider check | Explicit opt-in real-provider gate or separately approved live provider run. | No. Must not be required for deterministic release. |
| Unsupported/backlog | Behavior not claimed by this project. | No. Must stay visibly unsupported. |

## Safety Preflight

Required before manual TTY work:

| Item | Command or action | Expected behavior | Pass/fail | Record | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Repo state | `rtk git status --short --branch` | Branch is expected and no unrelated dirty files. | Pass if clean enough to attribute residue. | Branch, dirty entries, reason if dirty. | None. |
| Deterministic baseline | Run the deterministic gates in the gate table below. | Gates pass without real-provider execution. | Pass if every required deterministic gate passes. | Command, exit status, notable output markers. | Clean generated residue. |
| Private config boundary | Do not read, print, copy, grep, parse, modify, or summarize private provider config. | No private config or secret-bearing value appears. | Fail on any secret/config exposure. | `secretExposure=yes/no`. | Stop and report if exposed. |
| Workspace isolation | Use a disposable project under `/tmp/private-agents-test/live-tty-limited-dogfood`. | Manual edits stay inside that project. | Pass if no repo files are changed by the live session. | Workspace path and files changed. | Remove disposable workspace if safe. |

## Deterministic Gate Table

Run these from `/home/wang/projects/cheer` with `rtk`.

| Gate | Command | Expected marker |
| --- | --- | --- |
| Candidate mutation | `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | Pass; `realProviderTouched=false`. |
| Candidate failure taxonomy | `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test` | Pass; taxonomy classes match expected cases. |
| Two-file CLI evidence | `rtk npm run verify:real-user-capabilities:two-file-cli-evidence` | Pass; `changedFiles=src/a.ts,src/b.ts`; unsupported shapes stopped. |
| Unsupported patch E2E | `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e` | Pass; real-model-like unsupported outputs stop/error with no writes. |
| Long-session durability | `rtk npm run verify:session-durability:long` | Pass; synthetic compact/reload `/continue` durability. |
| Local MCP execution | `rtk npm run verify:mcp:local-execution` | Pass; local stdio fixture only. |
| MCP error taxonomy | `rtk npm run verify:mcp:error-taxonomy` | Pass; `externalMcpServerUsed=false`. |
| MVP mutation | `rtk npm run verify:real-user-capabilities -- --tier=mvp` | Pass; selected-workspace single-file update only. |
| Result contract | `rtk npm run verify:result-contract` | Pass. |
| TS shell build | `rtk npm run build -w packages/ts-shell` | Pass. |
| Real-suite listing only | `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run` | Pass; real execution skipped. |
| Provider readiness default skip | `rtk npm run verify:provider-readiness:real` | Pass/skip; real provider home not read. |
| Provider readiness classification | `rtk npm run verify:provider-readiness:real -- --classification-self-test` | Pass; redaction self-test passes. |
| Deterministic release | `rtk npm run verify:release:deterministic` | Pass; `broadReleaseReady=false`. |
| Diff hygiene | `rtk git diff --check` | Pass. |
| Final repo state | `rtk git status --short --branch` | Only intended docs should remain dirty. |

## Manual Setup

Use a real terminal, not a pipe-spawn harness. The live runner intentionally
requires `process.stdin.isTTY` and `process.stdout.isTTY`.

Suggested disposable workspace:

```sh
mkdir -p /tmp/private-agents-test/live-tty-limited-dogfood/project/src
printf 'export const value = "before";\n' > /tmp/private-agents-test/live-tty-limited-dogfood/project/src/app.ts
```

Suggested live launch, run by a human in a real terminal:

```sh
rtk npm run start:live:interactive -- --project /tmp/private-agents-test/live-tty-limited-dogfood/project
```

If live TTY cannot be run safely or meaningfully in the current environment,
record `liveTtyExecuted=no`, explain why, and do not fake a pass.

## Manual Observation Checklist

Each step records purpose, action, visible expectation, pass/fail criteria, what
to record, cleanup, and requirement level.

| ID | Requirement | Purpose | Command or manual action | Expected visible behavior | Pass/fail criteria | Record | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | Required if live TTY is feasible | CLI startup / interactive mode | Start `rtk npm run start:live:interactive -- --project <tmp-project>` in a real terminal. | Startup surface renders once, shows session/workspace context, and waits for input without non-TTY wording. | Pass if the prompt is usable and no secret/config path appears. | Command, terminal, `interactive`, session id if visible. | Exit the CLI. |
| M2 | Required if live TTY is feasible | Slash command basics | Enter `/help`, `/sessions current`, and `/mcp status`. | Commands return bounded surfaces, not model turns. `/mcp` must not imply external MCP readiness. | Pass if each command produces a readable result and the prompt returns. | Command, outcome, external MCP claim yes/no. | None. |
| M3 | Required if live TTY is feasible | `/continue` or resume/continue flow | After a completed or stopped deterministic/manual turn, enter `/continue <short follow-up>`. | Continuation surface references prior context when available; stopped contexts remain explicit. | Pass if outcome is success/stopped/error and prior changed/failed context is not hidden. | Mode, terminal outcome, continuation details. | None. |
| M4 | Required if live TTY is feasible | Approval / permission prompt behavior | Trigger an action that asks for approval only inside the disposable project; deny once, then allow once if safe. | Approval prompt is explicit; denial stops without pretending success; allow-once records the decision. | Pass if approval is requested visibly and denial/allow outcomes are distinct. | approvalRequested, approvalDenied/Allowed, input used. | Revert or remove disposable file changes. |
| M5 | Required if live TTY is feasible | Successful selected-workspace mutation display | Request a narrow existing-file update to `src/app.ts` only after approval. | Result surface lists success, changed file, verification/pass evidence, and next action. | Pass if exactly the intended file changes and result does not imply broader mutation capability. | changedFiles, failedFiles, postWriteVerification. | Restore or delete tmp workspace. |
| M6 | Required if live TTY is feasible | Stopped unsupported mutation display | Request 3+ files, delete/move, or broad apply_patch in the tmp project. | Request stops or is rejected; no write occurs; unsupported reason is visible. | Pass if unsupported request is stopped and `changedFiles` is empty. | unsupportedRequestStopped, changedFiles, reason. | Verify tmp files unchanged. |
| M7 | Required if live TTY is feasible | Failed mutation or post-write failure display | If deterministically available in the manual fixture, make one intended target unwritable and request the update. | Surface is stopped/error, includes failedFiles or post-write failure evidence, and does not claim rollback. | Pass if failure remains visible and no success-like wording hides it. | failedFiles, postWriteVerification, writerStarted if visible. | Restore permissions, remove tmp workspace. |
| M8 | Required if live TTY is feasible | Result surface checks | Observe at least one success, one stopped, and one error or unsupported result. | Terminal outcome is distinguishable as success/stopped/error. | Pass if all observed outcomes are unambiguous. | outcome per scenario. | None. |
| M9 | Required if live TTY is feasible | changedFiles / failedFiles visibility | Review mutation and stopped/failure surfaces. | `changedFiles` and `failedFiles` are shown when relevant; empty mutation state is not fabricated for non-mutation flows. | Pass if file state is truthful. | changedFiles, failedFiles. | None. |
| M10 | Required if live TTY is feasible | No rollback / no atomicity wording | Inspect two-file or partial-failure surfaces. | Wording says rollback is not attempted or atomicity is not claimed when relevant. | Pass if no rollback/atomicity guarantee is implied. | rollbackClaimShown yes/no, atomicityClaimShown yes/no. | None. |
| M11 | Required if live TTY is feasible | Compact / long-session continuity evidence | Use deterministic `verify:session-durability:long`; optionally run live `/continue` after several turns. | Deterministic gate passes; manual continuation remains coherent if attempted. | Pass if deterministic gate passed and any manual observation is recorded as manual only. | gate status, manual observation. | Clean session/runtime residue if generated in repo. |
| M12 | Required if live TTY is feasible | Local deterministic MCP success display | Prefer `rtk npm run verify:mcp:local-execution`; optionally inspect `/mcp status` in live TTY. | Local fixture evidence passes; live status does not imply external MCP readiness. | Pass if local deterministic MCP remains separate from external MCP. | command, externalMcpServerTouched yes/no. | Clean MCP temp logs if generated. |
| M13 | Required if live TTY is feasible | MCP failure taxonomy display | Use `rtk npm run verify:mcp:error-taxonomy`; optionally inspect `/mcp doctor` in live TTY. | Deterministic classifications are visible; no user MCP config is required. | Pass if failures are classified and external/user-configured MCP is not claimed. | classification, failure plane if visible. | Clean temp logs if generated. |
| M14 | Required if live TTY is feasible | `--print` mode | Run `rtk npx tsx packages/ts-shell/src/entrypoints/cli.tsx --project <tmp-project> --print "/sessions current"`. | Prints once and exits; no interactive approval prompt appears. | Pass if output is bounded and process exits. | mode=`--print`, exit status. | None. |
| M15 | Required if live TTY is feasible | stdin mode | Pipe one or two newline-delimited prompts into the CLI against the tmp project. | Output announces non-TTY stdin stream mode and processes each prompt in order. | Pass if stdin mode is clearly non-TTY and sequential. | mode=`stdin`, processed prompt count. | None. |

## Optional Real-Provider Manual Section

This section is opt-in only and is not required for deterministic release. Do
not run it unless the user explicitly approves real-provider execution.

Rules:

- Do not read, print, copy, grep, parse, modify, or summarize private provider config.
- Do not print API keys, tokens, headers, auth JSON, env contents, or secret-bearing command lines.
- Use only existing explicit opt-in gates or a separately approved live TTY run.
- Record `realProviderTouched=true/false`.
- Clean any generated isolated runtime/test directories when safe.
- A provider/network/auth failure is not automatically a product route failure.

Allowed opt-in gate examples after approval:

```sh
rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real
rtk npm run verify:provider-readiness:real
```

Do not add these checks to default gates.

## Unsupported And Backlog Reminders

The live TTY checklist does not claim:

- broad/general release readiness
- arbitrary project mutation
- broad apply_patch
- 3+ file writes
- delete/move
- rollback or atomicity
- external/user-configured MCP readiness
- default real-provider release gate
- broad real-provider mutation readiness

If a live run suggests one of these is needed, record a backlog item and stop
Route 07 instead of changing product behavior.

## Pass/Fail Recording Template

Use one row per manual scenario.

| Field | Value |
| --- | --- |
| Date/time |  |
| Tester |  |
| Git branch and HEAD |  |
| Workspace path |  |
| Command used |  |
| Mode | interactive / stdin / --print |
| Scenario ID | M1-M15 or optional-real |
| Approval requested | yes / no |
| Approval decision | denied / allow-once / allow-always / not applicable |
| Terminal outcome | success / stopped / error |
| changedFiles |  |
| failedFiles |  |
| postWriteVerification visible | yes / no / not applicable |
| Unsupported request stopped | yes / no / not applicable |
| Rollback or atomicity claim shown | yes / no |
| External MCP readiness implied | yes / no |
| Secrets or private config appeared | yes / no |
| Residue generated |  |
| Residue cleaned | yes / no / not applicable |
| Follow-up bug/backlog item |  |
| Pass/fail | pass / fail |

## Residue Cleanup

Before final reporting, check for and clean safe generated residue:

- `.sisyphus/**/permissions.jsonl`
- `packages/ts-shell/.sisyphus/**/permissions.jsonl`
- `undefined/`
- temporary audit output
- temporary CLI workspaces under `/tmp/private-agents-test/live-tty-limited-dogfood`
- temporary TTY logs
- temporary MCP logs
- generated `history.db` files in route-created test homes

If residue cannot be cleaned, report the path, why it exists, why it cannot be
safely removed, whether it contains secrets, and whether it should be gitignored
or manually removed.
