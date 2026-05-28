# Development Workflow

Keep work tied to the requested user-facing path and the current owner module.

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

## Change Hygiene

- Keep behavior changes, moves, and documentation changes separable when practical.
- Do not launch large rename-only cleanups by default.
- Rename old files only when they are already being substantially modified.
- Keep rename-only commits separate from behavior changes.
- Do not rename already validated route files merely for cosmetic consistency.

## Documentation

- Project state and plan documents can help identify durable decisions and material blockers, but they are not automatic truth.
- Prefer current user instruction, current code, focused tests, actual validation output, recent relevant commits, project state docs, then targeted reference comparison.
- Do not use project state files, plan docs, or `AGENTS.md` as route logs, completed milestone ledgers, transient baseline reports, or future roadmap queues.
