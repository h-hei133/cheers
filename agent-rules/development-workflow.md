# Development Workflow

Keep work tied to the requested user-facing path and the current owner module.

## First-Principles Thinking

- Start from the fundamental problem rather than convention or habit.
- Before writing code, explicitly confirm:
  1. **Real Goal**: What concrete user-facing capability or runtime invariant must hold?
  2. **Hard Constraints**: What architectural, memory/performance, and safety boundaries are non-negotiable?
  3. **Success Criteria**: What exact observable behavior or test proves the problem is solved?
- Challenge unnecessary ceremony, boilerplate, or legacy patterns when a direct, simpler design satisfies the real goal and constraints.

## Pitfall Memory (`HANDOFF.md`)

- **Read Before Starting**: Before starting a new task or touching an unfamiliar subsystem, read `HANDOFF.md` at the repository root to check recorded pitfalls and operational guardrails.
- **Record After Solving**: Whenever you encounter and resolve a non-obvious trap (runtime edge case, build/test hazard, state race, environment quirk), append a concise, factual entry (`Symptom` / `Root Cause` / `Rule`) to `HANDOFF.md` before finishing the task.
- Keep `HANDOFF.md` strictly for reusable engineering lessons and traps — never use it as a task status log or commit history.

## Before Editing

Identify:

- owner module or domain
- user-facing path or runtime capability being improved
- concrete blocker or risk being reduced
- focused files and tests
- why the task is more important than local cleanup or proof-only work

If the requested direction does not reduce a real blocker or improve a user-facing path, explain what was checked, what evidence was found, why the direction should not continue, and what action is closer to the real runtime path.
## Reading And Navigation

- Use focused code navigation before broad repository reading.
- Use subagents or Serena for focused code navigation when useful.
- Do not broad-read the whole repository when a focused ownership audit is enough.
- Inspect the target implementation before inspecting reference repositories.

## Route Documents And Prompts

- Do not turn implementation tasks into route-log writing.
- Do not make route-specific reporting rules global.
- Use route-specific stop and reporting requirements inside the current route document or prompt, not in `AGENTS.md`.
- Preserve durable project rules, but remove transient branch status, completed route logs, and route-specific process detail from global rule files.

## Change Hygiene & Scratch Cleanup

- Keep behavior changes, moves, and documentation changes separable when practical.
- Do not launch large rename-only cleanups by default.
- Rename old files only when they are already being substantially modified.
- Keep rename-only commits separate from behavior changes.
- Do not rename already validated domain files merely for cosmetic consistency.
- **No Root Scratch Residue**: Never scatter `.tmp-*` files, logs, or throwaway scripts in the repository root. Place all temporary diagnostic artifacts inside `.tmp/` or `/tmp/cheers-test/` and clean up temporary scripts/logs before yielding.
## Documentation

- Project state and plan documents can help identify durable decisions and material blockers, but they are not automatic truth.
- Prefer current user instruction, current code, focused tests, actual validation output, recent relevant commits, project state docs, then targeted reference comparison.
- Do not use project state files, plan docs, or `AGENTS.md` as route logs, completed milestone ledgers, transient baseline reports, or future roadmap queues.
