# Next Implementation Routes

## Overall Recommendation

Safe to implement now: yes, if implementation starts with a
compatibility-preserving route and avoids provider default behavior, approval
policy changes, result truth classification, output string churn, package
script changes, and live-provider execution.

First implementation route: Bootstrap Context and Fatal Boundary, or
Interactive Loop and Command Router. The better first route is Bootstrap
Context and Fatal Boundary because it reduces import fan-in and creates a
service/context object that later routes can consume without changing CLI
behavior.

Do not start with provider/approval/runtime invocation unless the route budget
explicitly includes truthfulness and redaction validation.

## Recommended Route Order

### Route A: Bootstrap Context and Startup Surface

Goal:

- Make `cli.tsx` call a named bootstrap runner and receive a typed CLI runtime
  service bundle.

Move:

- Root/config setup.
- Session/renderer construction.
- Recovery startup projection.
- Bootstrap call and bootstrap error rendering.
- Startup plan/surface selection.

Keep in `cli.tsx`:

- Shebang.
- `process.argv` and `process.cwd()` handoff.
- `main().catch`.
- Top-level call to the bootstrap runner and next mode runner.

Do not combine with:

- Provider credential semantics.
- Approval policy.
- Runtime result mapping.
- Interactive command routing.

### Route B: Print, Replay, and Stdin Mode Consolidation

Goal:

- Make non-interactive mode dispatch pass through a named print/stdin/replay
  router.

Move:

- `readStdinToEnd`.
- Replay branch dependency bundling.
- Print branch dependency bundling.
- Stdin stream and batch branch dependency bundling.

Keep:

- `resolveCliMode` compatibility.
- Existing `entrypoints/cliPrintModeRunner.ts` and
  `entrypoints/cliStdinModeRunner.ts` as compatibility facades if needed.

Do not combine with:

- Interactive readline extraction.
- Provider default changes.
- Output wording changes beyond mechanical movement.

### Route C: Interactive Loop Transport and Cancellation

Goal:

- Move readline lifecycle, prompt refresh, in-flight guard, close/SIGINT
  context, and double-Esc cancellation into `cli/interactive`.

Move:

- Readline creation.
- Prompt chrome refresh closure.
- Input in-flight guard.
- Close bridge context.
- Double-Esc cancellation state and timing.
- Initial prompt start.

Keep:

- Process-level entrypoint startup and final fatal boundary.

Do not combine with:

- Large slash command routing rewrite unless Route D is intentionally included
  and covered by baseline tests.

### Route D: Interactive Command Router

Goal:

- Move branch-by-branch slash action routing out of the executable shim.

Move:

- Workspace info shortcut.
- Resume-like action branch.
- Cancel-run branch.
- Session and workspace command branches.
- MCP branch.
- Help branch.
- View and agent mode branches.
- Permission command branch.
- Normal prompt execution branch.

Keep:

- Existing command implementation modules as facades until a later cleanup.
- Prompt lifecycle and refresh hooks explicit in router outputs.

Do not combine with:

- Session persistence changes.
- Workspace root policy changes.
- MCP implementation changes.

### Route E: Runtime Invocation, Provider, and Approval Bridges

Goal:

- Remove the large `ShellSessionRuntime` `runPrompt` closure from `cli.tsx`.

Move:

- Provider credential snapshot bridge.
- Approval escalation handler construction.
- Approval audit payload mapping.
- Apply-patch runtime opt-in projection.
- Planning mutation execution option construction.
- `streamOrchestratedResponse` invocation wiring.

Keep:

- No live-provider default.
- No provider config manual reads.
- No truth classification changes.

Do not combine with:

- Output rendering changes.
- Session/workspace command routing.
- Package entrypoint shim cleanup.

### Route F: Entrypoint Shim Cleanup

Goal:

- Reduce `cli.tsx` to the executable shim, fatal boundary, and one composed
  process runner call.

Move:

- Remaining local adapters.
- Remaining import fan-in not required for process shim.

Keep:

- Package bin/start/dev compatibility path.
- `entrypoints/cli.tsx` as the stable executable.

Do not combine with:

- Any semantic owner extraction.
- Renaming package scripts.
- Deleting compatibility facades still imported by tests or scripts.

## What Should Not Be Combined

| Do not combine | Reason |
| --- | --- |
| Provider default behavior with approval bridge extraction | Both are safety-sensitive and can accidentally enable provider or write paths. |
| Result truth/output changes with interactive loop extraction | Transport changes can hide false success or interrupted/stopped distinctions. |
| Session command routing with session persistence extraction | CLI should not become a persistence owner. |
| Workspace command routing with workspace authority/write policy | Root display/attach behavior is separate from write authorization. |
| MCP router movement with MCP implementation changes | Preserve unavailable-server diagnostics while moving routing only. |
| Entrypoint shim cleanup with package script changes | The package executable path is compatibility surface. |

## Move To Next File?

Do not move to the next audit target until at least Route A or Route C/D has
been implemented, unless the reset program explicitly asks for another
audit-only pass. `cli.tsx` is still a partial monolith and remains a meaningful
architecture concentration point.
