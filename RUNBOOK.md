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

## Suggested debug reading order

1. `packages/ts-shell/src/entrypoints/cli.tsx`
2. `packages/ts-shell/src/core/shell/sessionRuntime.ts`
3. `packages/ts-shell/src/core/query/queryLoop.ts`
4. `packages/ts-shell/src/core/query/resultMapper.ts`
5. `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
