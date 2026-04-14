# AGENTS.md

## Scope

This directory is the working project for the private coding agents rewrite.

- Working directory: `private-coding-agents/`
- Reference/source library: parent directory `..\` (the ClaudeCode source snapshot)

Use the parent repository as a read-only architecture and migration reference.
Implement new code only inside this working project unless the task is explicitly source analysis against the parent snapshot.

## Repository boundaries

- Default to editing only files under this directory.
- Treat the parent snapshot as read-only.
- Do not modify files in `..\`.
- Run build and test commands from this directory, not the parent source snapshot root.
- Keep TypeScript imports ending in `.js`.

Reference-oriented parent paths that are especially important during migration include:

- `..\QueryEngine.ts`
- `..\query.ts`
- `..\tools.ts`
- `..\commands.ts`
- `..\setup.ts`
- `..\services/mcp/**`

If source and target responsibilities differ, preserve the source snapshot as reference truth for responsibilities, but implement the target design inside this working project.

## Working mode

Default to execution-first mode.

Your default job is not to write plans, summaries, or project-level audits.
Your default job is to complete one bounded implementation or hardening cycle in the real repo:

- inspect the relevant code, tests, and failure surface
- make the smallest necessary code change
- run directly related validation
- report what actually changed and what was actually verified
- recommend the single best next action

Do not claim implementation is complete unless files were actually modified and validation was actually run.

If you cannot access the repo, cannot modify files, cannot run commands, or cannot validate, output:

BLOCKED
- reason
- missing capability or permission
- what the user needs to provide

## Core principles

### 1. Code reality first

Prioritize evidence in this order:

1) current task input
2) related code
3) related tests
4) current failure output or validation results
5) recent changes in the directly relevant files
6) `PROJECT_STATE.md` or other documents

Documents are reference material, not automatic truth.
If documents conflict with code reality, trust code reality.

### 2. Simplicity first

Prefer the simplest change that closes the current gap.
Do not introduce abstraction, wrappers, or new layers unless the task clearly requires them.

### 3. Surgical changes

Make narrow, local changes tied to the current task.
Do not opportunistically refactor unrelated areas.
Do not expand a small task into a broad cleanup or redesign.

### 4. Goal-driven execution

Translate the task into a concrete, verifiable target before changing code.
A good target is something you can validate directly in code, tests, or runtime behavior.

Validation does not automatically mean “add another test”.
Use the most direct proof for the current change.

### 5. No default project-level audit

Do not default to:
- project-wide reprioritization
- go/no-go judgment
- broad architecture review
- routine document correction
- routine `PROJECT_STATE.md` updates

Only switch into a refocus decision if the current task is clearly stale, contradicted by code reality, or obviously lower value than a more direct nearby failure surface.

## Task handling

For each task, work in this order:

1) read the current task
2) read `PROJECT_STATE.md` if it is easily available
3) inspect the related implementation, tests, failure output, and recent relevant file changes
4) decide whether the task is still worth continuing at the current slice
5) if yes, make one bounded implementation or hardening pass
6) run directly related validation
7) report actual results
8) recommend one next action

Do not treat `PROJECT_STATE.md` as a blocker.
If it is missing, outdated, or unclear, continue using code and tests as the primary evidence base.

## Task validity check

Before changing code, only check these questions:

1) Does the task still match the current code reality?
2) Does it still serve the current acceptance surface or failure surface?
3) Has it been overtaken by a more direct and better-evidenced nearby failure?

Do not ask whether this is “the most important problem in the whole project”.
Only ask whether it is still the best current slice to continue.

If the task should not continue as written, output:

REFOCUS
- why the current task should not continue
- what code, tests, or failures were actually checked
- the direct evidence
- the better next implementation action
- why that action is closer to the real gap
- why no code was changed in this round

## Result priorities

A successful round only needs one of the following:

### A. Implementation increment

Preferred outcome.

Examples:
- real implementation code changed and directly validated
- one runtime semantic made explicit
- one contract, boundary, or invariant tightened
- one minimal fix landed and verified

### B. Test increment

Acceptable but secondary.

Examples:
- one directly relevant regression test added
- one previously unclear behavior boundary made explicit through a test

Do not let test-only output become the default multi-round progression pattern.
If recent rounds were test-dominant and no new failure was exposed, prefer the next action to be:
- the smallest implementation slice
- the smallest fix exposed by the tests
- or an implementation task in a neighboring acceptance surface

### C. Clear stop or switch signal

If there is neither code increment nor evidence-based state increment, explicitly choose one:
- continue current task
- close the real failure first
- switch to a new concrete slice
- pause current direction

Do not repeat the same ineffective loop without a real change in evidence.

## Saturation awareness

When recommending the next action, check whether recent work is staying inside the same acceptance surface and the same core invariant family.

Core invariant families include:
- recovery lifecycle exactly-once
- terminal envelope / durable status classification
- replay / read-model consistency
- MCP capability routing / visibility / execute rejection
- execution parity / sandbox / daemon
- other clearly named families

If recent rounds are staying in the same family, do not recommend a near-duplicate proof unless you can explain:
- what new boundary class it covers
- why that boundary is more valuable than switching to a nearby implementation slice or adjacent acceptance surface

Switching families is not, by itself, a good reason to keep adding test-only work.
If recent rounds were mostly proof-oriented, prefer the next action to move toward implementation closure.

## Test recommendations

If the recommended next action is primarily “add a test”, you must be able to explain:

1) what new invariant family or boundary class the test covers
2) why it is not a near-duplicate of the current family
3) why there is no more direct minimal implementation slice to do first
4) why the test reduces uncertainty more than an implementation slice would

If you cannot explain all four, do not recommend a pure test task as the next best action.

## Architecture boundaries

### TypeScript = control plane

Includes:
- shell
- session
- orchestration
- slash command
- recovery
- permission UX
- MCP capability routing
- durability / replay / recovery semantics

### Rust = execution plane

Includes:
- daemon
- command execution
- timeout / cancel
- sandbox preflight
- process-oriented execution responsibility

### contracts = cross-runtime semantic boundary

### Python eval layer

- `packages/python-eval/`

Default rules:
- keep replay, recovery, orchestration, transcript re-entry, and durability semantics in the TypeScript control plane
- only move work into Rust when it is clearly execution responsibility
- do not push control-plane recovery or orchestration semantics down into Rust unless the task is explicitly about execution-plane behavior

## Core project layout

- `contracts/` = cross-runtime schemas and generated types
- `packages/ts-shell/` = TypeScript shell and orchestration runtime
- `packages/rust-core/` = Rust execution core / daemon
- `packages/python-eval/` = Python eval layer
- `scripts/` = workspace scripts for doctor, setup, build, test, workflow
- `.sisyphus/` = plans, drafts, evidence, notes

Treat `.sisyphus/` as supporting context, not as stronger evidence than code, tests, or runtime behavior.

## Migration guidance

Parent snapshot = source-of-truth for responsibilities.
This project = target implementation.

When migrating a ClaudeCode subsystem:

1) identify the source-side responsibility clearly
2) build a source-to-target responsibility map
3) implement the target behavior inside this project
4) use compatibility wrappers where practical
5) validate behavior in the target repo, not only by reference comparison

Do not cargo-cult source structure if the target architecture already has a better placement consistent with this repo’s control-plane / execution-plane / contracts split.

## Validation rules

Run the narrowest validation that directly matches the change.

Validation priority:
1) directly related tests
2) acceptance-surface-related tests
3) broader build or wider verification only when needed

Do not default every round to full-repo validation.

If validation fails, distinguish:
- failures introduced by this round
- failures relevant to the current task
- pre-existing unrelated failures

If a failure is pre-existing and unrelated, record it as such and do not automatically widen the task just to clean it up.

## Stop conditions

Stop expanding the current round if any of the following becomes true:

- the next step would require a new persistence layer
- the next step would require broad event protocol or taxonomy changes
- the next step would push control-plane semantics into Rust
- changes are spreading clearly outside the current acceptance surface
- further progress would depend on broad scaffolding rather than the current slice itself
- a more direct real failure surface has overtaken the current task

At that point, close the smallest honest loop and report the result.

## Reporting expectations

When claiming implementation work is complete, include:
- the files actually changed
- what changed in each file
- the commands actually run
- the results of those commands
- what was not run
- the single best next action

Do not present a design or intention as a completed implementation.
Do not say something was validated unless it was actually run.

## PROJECT_STATE.md handling

Do not update `PROJECT_STATE.md` by default.

Only update it when one of these is true:
- a real state increment was established
- a valuable runtime semantic proof was added
- the main current slice or main gap materially changed
- the file is clearly behind code reality in an important way

Otherwise, leave it unchanged and only mention what would be worth recording there.