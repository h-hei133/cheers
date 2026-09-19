# Phase A + B review brief (shared context)

## Scope
Repo `/home/wang/projects/coding-agents`; package `packages/ts-shell`.
- Phase A: `db648d9a~1..18309200`
- Phase B: `b463d87d..HEAD` (HEAD `9c6b9fc5`)

## Baselines verified by the main agent (current state)
| gate | value | how |
|---|---|---|
| production `--strict` (excl. tests) | 0 | `npx tsc --noEmit --strict` |
| non-strict full | 244 | `npx tsc --noEmit` |
| build | 0 | `npx tsc -p tsconfig.build.json --noEmit` |
| SCC | 0 cycles / 1500 files | self-written script |
| full suite | 519 files / 3169 passed / 1 skipped | `npx vitest run` |
| `!`/`as` in A+B diff | 0 | grep over `git diff` |

## PTY / real-CLI verification (added after the review was first drafted)
Real CLI driven, provider-backed and provider-free:
- `--version` → `0.1.0 (ts-shell MVP)`
- `--host-command '{"action":"status"}'` → structured JSON, blocked/no-session
- `--host-command '{"action":"start-turn","inputMode"...}'` with `providerMode:"synthetic"` →
  `accepted:true`, 132 events, no fatal
- `--print --replay-file` against a real provider → full turn,
  terminal `Result\n- Outcome: success\n- Detail: completed`
- **Pre-split vs post-split comparison** via `git worktree` at `c8b03d12~1`:
  structural render **identical**, error path identical (exit 1, same message)
