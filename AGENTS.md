# AGENTS.md

## Scope

This repository is the working project for a private multi-language coding agents rewrite.

Writable target repo:
D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents

Read-only reference repo:
D:\LenovoSoftstore\pyproject\source-claudecode

The target repo is the only place where code may be modified.
The reference repo is used only to recover ClaudeCode’s load-bearing runtime semantics, responsibility boundaries, and migration truth.

## Repository Boundaries

- Default to editing only files under this repository.
- Treat the parent ClaudeCode snapshot as strictly read-only.
- Do not modify files in `..\`.
- Run build and test commands from this repository root, not from the parent snapshot root.
- Keep TypeScript imports ending in `.js`.

Important reference-oriented parent paths include:

- `..\QueryEngine.ts`
- `..\query.ts`
- `..\tools.ts`
- `..\commands.ts`
- `..\setup.ts`
- `..\services/mcp/**`

If source and target responsibilities differ, preserve the source snapshot as reference truth for responsibilities, but implement the target design inside this working project.

## Stage Intent

The current stage is not primarily about expanding product surface or continuing local runtime hardening by default.

The current stage goal is:

Close a user-minimal real main path while staying aligned with ClaudeCode-grade load-bearing architecture.

Default task selection rule:
Do not ask "what can still be locally hardened?"
Ask "what most directly blocks a user from continuously completing a real task?"

Do not treat the current stage as:

- proof-family closure as the default
- acceptance-surface micro-patching as the default
- document-sync-first work
- project-level audit mode
- roadmap expansion mode

## Architecture Boundaries

### TypeScript = control plane

Includes:

- shell
- session
- orchestration
- slash command
- recovery
- permission UX
- MCP capability routing
- runtime durability / replay / recovery semantics

### Rust = execution plane

Includes:

- daemon
- command execution
- timeout
- cancel
- sandbox preflight
- execution responsibility

### contracts = cross-runtime semantic boundary

Used to carry protocol, boundary, lifecycle, and semantic constraints shared by TypeScript and Rust.

### Python eval layer

Includes:

- `packages/python-eval/`

Default rules:

- replay / recovery / orchestration / transcript re-entry / durability stay in TypeScript
- only clear execution responsibility goes into Rust
- do not move control-plane semantics into Rust for local convenience
- do not break TS / Rust / contracts boundaries just to make a demo path appear usable

## User-Minimal Real Main Path

All implementation work in this stage must directly serve at least one of these six steps:

1. User starts the CLI in a clean runnable environment and sees clear runtime mode and session state.
2. User creates a new session or resumes an interrupted one, and session health is checked first; broken sessions must not pollute the current flow.
3. User enters a real task, and the system enters a unified query loop.
4. The system uses a real model and real toolchain; permission escalation is explicitly approved or denied by the user, not inferred from prompt keywords.
5. The system emits a clear terminal state (success / stopped / error) and persists it; errors are actionable and retryable.
6. The user can continue the next turn or resume after interruption with consistent semantics and without manual repair.

Before starting each round, always identify:

- which of the six steps the current task directly advances
- if none, the task is not a default mainline task for this stage

## Current Priority Principle

Use `PROJECT_STATE.md` as the current stage snapshot for top blockers and immediate priorities.

Unless newer evidence clearly overrides it, prefer work that directly closes the current top blockers on the real main path.

Do not freely jump to unrelated local correctness slices unless they more directly improve real user continuity than the current main-path blockers do.

## ClaudeCode Reference Alignment

The reference repo is the architecture truth source for ClaudeCode’s load-bearing runtime semantics.

When the current task touches:

- session lifecycle
- query loop / orchestration
- permission model
- recovery / resume
- capability routing
- terminal / durable semantics
- execution-plane responsibility

you must:

1. inspect the target repo implementation first
2. do a small, targeted comparison against the ClaudeCode reference
3. use that comparison to keep responsibility boundaries and runtime semantics aligned

Do not use the reference repo for:

- large-scale source scanning
- architecture audits
- mechanical source-structure copying

Do not create a toy implementation that merely runs while drifting away from ClaudeCode-grade architecture.

The goal is not a simplified demo clone.
The goal is a target implementation whose user-facing main path is being closed while staying aligned with ClaudeCode’s load-bearing semantics.

## Modes

This prompt supports two modes, but Implementation is the default.

### Mode=Implementation

Use when the current blocker is sufficiently clear.

Requirements:

- must modify code around a real blocker on the six-step main path
- must run directly related validation
- must not stop at summary only
- must not default to test-only output
- must not prioritize document sync over implementation closure

### Mode=State-Recovery

Use only when:

- taking over an interrupted scene
- the factual state is unclear
- docs, code, tests, and behavior disagree
- the main-path blocker is not yet clear enough for direct implementation

Requirements:

- recover factual state first
- identify:
  1. which of the six steps is currently blocked
  2. which current blocker is the most direct
  3. what the smallest implementation action is
- do not stop at status summary
- state recovery must lead into an implementation action unless truly BLOCKED

## Evidence Priority

Prefer evidence in this order:

1. current task input
2. current main-path blocker
3. related code
4. related tests
5. current failure output / validation result
6. recent changes in directly relevant files
7. `PROJECT_STATE.md` and other docs
8. small targeted ClaudeCode reference comparison

Documents are reference material, not automatic truth.
If docs conflict with code reality, trust code reality.

## Task Selection Rules

Before editing code, answer:

1. Which of the six main-path steps does this task directly advance?
2. Which current blocker does it address?
3. If it does not directly address the main path, why is it still more urgent?
4. If you cannot justify 3, do not choose it as the main task.

If the current task should not continue as written, output:

REFOCUS

- why the current task should not continue
- what code / tests / failures / docs were actually checked
- the direct evidence
- the better next implementation action
- why it is closer to the real main path
- why no code was changed this round

## Default Prohibitions

Unless directly blocking the real main path, do not:

- keep adding same-family local runtime hardening cases
- prioritize doc sync above implementation closure
- do project-level audits, roadmap expansion, or wide refactors
- expand naming systems or state taxonomy
- do UI polish unrelated to the minimal real main path
- add test-only work as the default mainline output
- keep closing local correctness slices that do not move real user usability
- introduce temporary behavior that makes the path look usable while drifting away from ClaudeCode-grade semantics

## Success Criteria

In this stage, success is not "local state increment".
A round only counts as meaningful progress if it achieves at least one of:

1. Main-path increment

- one of the six steps becomes more real / usable

2. Main-path blocker reduction

- one current blocker is materially reduced or removed

3. Main-path validation gate

- a direct smoke / E2E gate is added for the real user main path

Tests only count as primary progress if they gate the real user main path.
A local proof test alone is not enough.

## Validation Rules

Run the narrowest validation that directly supports the main-path change.

Priority:

1. directly related tests
2. directly related smoke / E2E for the main path
3. broader build / wider checks only when needed

Do not default every round to full-repo validation.

If validation fails, distinguish:

- failures introduced this round
- failures relevant to the current main path
- pre-existing unrelated failures

If a failure is pre-existing and unrelated, record it as such and do not automatically widen the task just to clean it up.

## Stop Conditions

Stop expanding the round when:

- the next step would require a new persistence layer
- the next step would require broad event protocol / taxonomy changes
- the next step would move control-plane semantics into Rust
- changes spread beyond the directly relevant main-path slice
- progress would now depend on broad scaffolding instead of the current slice itself
- a more direct blocker has overtaken the current action
- further progress would visibly drift away from ClaudeCode load-bearing semantics

## Reporting Requirements

If implementation is claimed complete, include:

- files actually changed
- what changed in each file
- commands actually run
- results of those commands
- what was not run
- which of the six steps was advanced
- which blocker was reduced
- the single best next action

Do not present intention or design as completed implementation.
Do not say something was validated unless it was actually run.

## PROJECT_STATE.md Handling

Do not treat `PROJECT_STATE.md` as the source of truth.
Use it as a stage snapshot only.

Only update it when:

- a blocker materially changes
- a real main-path fact is established
- the current recommended action materially changes
- the file is clearly behind code reality

Otherwise, leave it unchanged and only mention what would be worth recording there.
