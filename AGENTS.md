# AGENTS.md

## Scope and Repositories

This repository is the writable target project for a private multi-language coding agents rewrite.

Writable target repository:

```text
/home/wang/projects/coding-agents
```

Read-only reference repositories:

```text
/home/wang/projects/source-claudecode
/home/wang/projects/opencode
/home/wang/projects/gemini-cli
/home/wang/projects/OpenHands
/home/wang/projects/stagehand
/home/wang/projects/playwright-mcp
/home/wang/projects/mempalace
/home/wang/projects/mem0
/home/wang/projects/graphiti
/home/wang/projects/inspect_ai
/home/wang/projects/mini-swe-agent
```

Only the target repository may be modified. The reference repositories are used only to recover load-bearing runtime semantics, responsibility boundaries, permission behavior, tool execution boundaries, and user-visible result semantics.

Reference repository roles:

- Claude Code: behavior, UX, tool-result surface, compact/resume, and permission-surface comparison.
- opencode: open-source agent architecture, permission/tool execution, apply_patch, session processor, and provider-abstraction comparison.
- Gemini CLI: CLI/core layering, ReAct loop, built-in tools, MCP, checkpoint/headless, and sandbox comparison.
- OpenHands: browser/runtime events, action/observation surface, sandbox/tool execution, and recovery/reporting comparison.
- Stagehand: browser observe/act/extract, action target metadata, selector repair, action cache, and web interaction comparison.
- Playwright MCP: browser tool schema, browser context/session lifecycle, snapshots, accessibility tree, and MCP browser-runtime comparison.
- MemPalace: layered memory, local-first recall/wake-up, evidence-first memory structure, and backend-boundary comparison.
- mem0: long-term memory extraction, memory lifecycle, retrieval, user/project memory behavior, and memory API comparison.
- graphiti: temporal/entity graph memory, relationship extraction, invalidation, and graph-backed recall comparison.
- Inspect AI: eval harness, task/scorer separation, sandbox/tool execution, transcript, and report/score comparison.
- mini-swe-agent: lightweight agent loop, CLI trajectory, subprocess/tool evidence, benchmark scenarios, and failure-report comparison.

Do not copy implementation code mechanically from the reference repositories. Use them to align architectural responsibility and runtime behavior.

## External Codex / RTK Configuration

RTK is configured for Codex CLI outside this repository.

Use the global configuration as the source of truth for RTK command discipline and Codex-wide operating rules:

```text
Codex global instructions path: /home/wang/.codex/AGENTS.md
RTK.md: /home/wang/.codex/RTK.md
AGENTS.md: @/home/wang/.codex/RTK.md reference already present
```

Do not duplicate detailed RTK command rules in this repository-level `AGENTS.md`. If RTK behavior or command policy is unclear, consult the global files above.

## Repository Boundaries

- Default to editing only files under the target repository.
- Treat all reference repositories as strictly read-only.
- Do not modify files in parent directories or sibling repositories.
- Run build and test commands from the target repository root unless a tool explicitly requires another working directory.
- Keep TypeScript imports ending in `.js` when importing local TypeScript modules that compile to JavaScript.
- Do not introduce repository-local rules that conflict with the global Codex or RTK configuration.

If the reference repositories and the target repository use different structure, preserve the reference semantics and implement the target design inside this repository.

## Real Provider Configuration Boundary

A real provider home exists at:

```text
/home/wang/.private-agents-real
```

Real provider configuration may only be consumed through explicit opt-in gate commands that set:

```text
PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real
```

Never manually read, print, copy, clean, modify, summarize, or reveal files under the real provider home. This includes provider env files, config files, keys, tokens, headers, credentials, session files, or any provider-auth material.

Real-provider gates must use isolated runtime and test directories, such as:

```text
PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/<gate-name>
HOME=/tmp/private-agents-test/<gate-name>-home
USERPROFILE=/tmp/private-agents-test/<gate-name>-home
```

Do not treat `PRIVATE_AGENTS_REAL_HOME` as a normal runtime home. It is only an explicit credential/config source for approved readiness or smoke scripts.

Real-provider validation must preserve:

- redaction of secrets and provider config paths
- clean repository status before and after the gate
- no audit/history residue in the repository
- precise failure attribution, such as provider-network, config failure, route failure, redaction failure, unexpected write, or unexpected success claim

## Architecture Boundaries

### TypeScript = control plane

TypeScript owns shell, session, orchestration, query loop, slash commands, permission UX, recovery, replay, runtime durability, result mapping, terminal/session surface, and high-level capability routing.

### Rust = execution plane

Rust owns execution-plane responsibilities such as daemon behavior, command execution, timeout, cancellation, sandbox preflight, and low-level execution isolation.

### contracts = cross-runtime semantic boundary

`contracts` carries shared protocol, lifecycle, boundary, and semantic constraints across TypeScript and Rust. Contract changes must keep both sides aligned.

### Python eval layer

`packages/python-eval/` is an evaluation layer. Do not move orchestration, replay, recovery, permission, or runtime durability semantics into the Python eval layer for local convenience.

Default responsibility rules:

- Keep control-plane semantics in TypeScript.
- Put only clear execution-plane responsibility in Rust.
- Do not break TypeScript / Rust / contracts boundaries to make a demo path appear usable.
- Do not hide permission, write authorization, or runtime lifecycle semantics behind convenience plumbing.

## Reference Alignment

Use the reference repositories for targeted semantic comparison when a task touches:

- session lifecycle
- query loop or orchestration
- permission model
- tool boundary or tool execution
- file edit/write behavior
- recovery or resume
- terminal/result/session surface
- durable state
- provider-facing behavior
- execution-plane responsibility

Expected reference workflow:

1. Inspect the target repository implementation first.
2. Perform a small, targeted comparison against the relevant Claude Code, opencode, or Gemini CLI files.
3. Use the comparison to preserve responsibility boundaries and runtime semantics.
4. Implement the target design in this repository.

Do not use the reference repositories for large-scale source scanning, architecture audits without a direct task, or mechanical source-structure copying. Keep reference comparison to a small number of task-relevant snippets; do not perform broad repository scans when a targeted comparison is enough.

## Large File and Module Boundaries

Avoid growing central orchestration files. Prefer adding focused modules for new behavior instead of extending already-large or high-touch files.

Use minimal wiring only in these files unless there is a documented reason:

```text
packages/ts-shell/src/entrypoints/cli.tsx
packages/ts-shell/src/session/SessionManager.ts
packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
```

Do not place policy logic, writer boundary logic, permission semantics, provider-gate semantics, or result/session mapping logic directly in those files when a focused module can own it.

When extracting or adding behavior:

- keep invariants close to the code that owns them
- move related tests with the new module when practical
- prefer module-level documentation for safety-sensitive boundaries
- avoid adding broad helper layers that obscure responsibility
- avoid trivial one-use helpers unless they isolate policy, boundary, or safety semantics from a large file

## File Placement and Naming Rules

Directory names should carry domain context. File names should carry local responsibility.

Do not encode a roadmap title into a file name. Prefer short, responsibility-based names over long names that combine every route, provider, permission, status, and implementation detail.

In `packages/ts-shell/src/orchestration/patchResult/`, do not repeat the full `singleFileApplyPatch` prefix unless it is needed to avoid real ambiguity. The directory already provides patch/result context.

Use consistent suffixes:

- `*Gate.ts` for precondition checks and entry decisions.
- `*Route.ts` for composed execution paths.
- `*Result.ts` or `*Projection.ts` for terminal/result/session mapping.
- `*State.ts` for state models.
- `*Smoke.ts` for real-provider or end-to-end smoke wrappers.
- `*Authority.ts` or `*Policy.ts` for boundary and safety checks.
- `*Surface.ts` for user-visible or terminal-facing projections.
- `*Bridge.ts` for adapter layers between internal contracts and runtime-facing shapes.

Tests should normally match the module name:

```text
workspaceWriteRoute.ts
workspaceWriteRoute.test.ts
```

Integration tests may use scenario names, but should still be short and responsibility-based.

Prefer adding focused modules over growing central files. If a file name exceeds 45 characters or has more than four semantic segments, consider whether the directory should carry more context or whether the file should be split.

Avoid route-title names and names with more than four semantic segments. Prefer short, responsibility-based names such as `permissionUxGate.ts`, `noWriteRuntimeRoute.ts`, `realProviderWriteSmoke.ts`, or `productionRouteProjection.ts`.

Use this placement guidance for common areas:

- `packages/ts-shell/src/orchestration/patchResult/`
  - patch/apply_patch route contracts, gates, result projections, write policies, authority checks, and small orchestration helpers.
  - Do not place CLI parsing, provider-auth logic, or broad session persistence here.

- `packages/ts-shell/src/orchestration/patchApplication/`
  - low-level patch application or writer implementation details.
  - Do not place terminal/session projection logic here.

- `packages/ts-shell/src/core/query/`
  - generic query and result mapping.
  - Prefer projecting feature-specific state into a generic result shape before handing it to query-level mappers.

- `packages/ts-shell/src/core/shell/`
  - shell/session display surface.
  - Keep feature-specific policy and writer semantics outside this layer when possible.

- `packages/ts-shell/src/entrypoints/`
  - CLI argument parsing and minimal entrypoint wiring.
  - Do not place permission, writer, route, or result mapping logic directly in entrypoints.

- `packages/ts-shell/src/session/`
  - session lifecycle, durable session state, and resume/recovery boundaries.
  - Do not place feature route details here unless the task is explicitly about durable session semantics.

- `scripts/`
  - repository-level validation scripts, readiness checks, and real-provider smoke entrypoints.
  - If a validation script grows too large, prefer extracting scenario-specific smoke modules under a focused subdirectory such as `scripts/real-provider-smokes/`.

- `PLANS.*` and `PROJECT_STATE.md`
  - project-state aids and human-facing planning records.
  - Use them to understand durable decisions and material blockers, not as the primary place for route logs, completed milestones, branch state, or future roadmap queues.
  - These files may use descriptive names, but AGENTS.md and runtime modules should stay stable and responsibility-based.

Do not launch large rename-only cleanups by default. Prefer this migration strategy:

1. Apply the naming and placement rules to new files.
2. Rename old files only when they are already being substantially modified.
3. Keep rename-only commits separate from behavior changes.
4. Do not rename already validated route files merely for cosmetic consistency.
5. Keep long plan-document names acceptable, but keep code module names short.


## Naming and API Shape Rules

Use short, responsibility-based names. Do not encode an entire roadmap title into a file, function, or type name.

Good examples:

```text
workspaceBoundary.ts
workspaceAuthority.ts
writeFailureState.ts
writeRecovery.ts
runtimeWriteRoute.ts
routeWiringGate.ts
productionRoute.ts
permissionUxRoute.ts
```

Avoid long route-title names that combine every project concept into one module name.

For safety-sensitive APIs:

- prefer explicit enums over booleans
- prefer named option objects over positional literals
- avoid ambiguous `approved`, `enabled`, or `allowed` booleans when the distinction is permission, preview, dry-run, or write authorization
- keep dry-run, permission-pending, denied, blocked, approved-for-write, and write-success states distinct
- never let prompt keywords imply write authorization

Test files should normally match the module under test.

## Task Selection Rules

Before editing code, identify:

1. Which user-facing path or runtime capability the task improves.
2. Which concrete blocker or risk it reduces.
3. Why this task is more important than local cleanup or proof-only work.
4. Which files and tests are directly relevant.

If the task does not reduce a real blocker or improve a user-facing path, do not make it the main implementation task.

If the requested task appears misaligned, output a refocus recommendation that states:

- what was checked
- what evidence was found
- why the current direction should not continue
- what better implementation action is closer to the real runtime path

## Default Prohibitions

Unless directly required by the current task, do not:

- add a provider
- change provider/auth core
- read, print, copy, clean, or modify real provider configuration
- change release/default gates
- touch sealed release-core paths
- perform wide architecture audits or roadmap expansion
- do broad refactors
- expand naming systems or state taxonomies for their own sake
- add test-only work as the default output
- add UI polish unrelated to the active runtime path
- keep closing same-family local correctness slices after the relevant risk has been reduced
- move control-plane semantics into Rust for convenience
- introduce temporary behavior that makes the system look usable while drifting away from the intended architecture

For apply_patch and file-writing work, do not:

- infer write authorization from prompt text
- treat dry-run, preview, or permission-pending as write success
- skip final stale-read before writer
- widen single-file update behavior into multi-file/add/delete/move without a dedicated plan
- treat isolated test/workspace success as default production readiness
- weaken workspace boundary checks
- hide unverified write outcomes behind success-like terminal states

## Trigger-Based Validation Rules

Run focused validation tied to the change.

Use these trigger rules:

- If CLI flags change, run focused CLI tests.
- If runtime route behavior changes, run focused runMvp/runtime route tests.
- If result or session surface changes, run focused result/session tests.
- If workspace writer policy changes, run workspace write route tests, mutation-lane rejection regression, and build.
- If permission, approval, or write-decision behavior changes, run focused permission/write-gate tests.
- If provider-facing routes or smoke scripts change, run syntax checks, readiness preflight, and the relevant isolated real-provider gate when appropriate.
- If contract shapes change, run tests that validate both producer and consumer semantics.
- If default rejection behavior is relevant, run the mutation-lane rejection regression.

Do not default every round to full-repository validation. Broaden validation only when touched files cross core boundaries or focused tests cannot cover the risk.

## Test Contract and Baseline Discipline

Capability contracts are the source of truth for expected behavior. Tests are evidence for those contracts, not automatically the source of truth. When a test disagrees with the current capability contract, classify the mismatch before changing implementation or tests.

When broad, integration, contract, or route-gate tests fail, classify each relevant failure before repair, rebaseline, skip, or deletion:

- `product behavior drift`: the implementation no longer satisfies the current contract. Fix product code and add or keep focused regression coverage.
- `stale expectation`: the test asserts an older contract. Rebaseline it to the current contract with precise assertions.
- `harness/setup drift`: the test harness no longer matches the runtime path. Fix the harness instead of changing product behavior to satisfy the harness.
- `obsolete scenario`: the scenario no longer represents a supported or meaningful contract. Replace it with current-contract coverage or move it to a backlog/pending note.
- `future capability expectation`: the test describes a desired future capability, not current supported behavior. Do not keep it as a required current green gate; convert it to backlog/pending documentation, an explicit unsupported-behavior test, or an actionable stopped-result assertion.
- `environment/flaky issue`: the failure depends on environment, network, provider, timing, or external configuration. Record the attribution and do not claim a product failure without evidence.

Do not make tests pass by weakening assertions, broad skipping, deleting scenarios without replacement, or mass-rebaselining terminal text and snapshots. Rebaselined tests should become more precise under the current contract, not looser.

Before changing tests:

1. Identify whether the mismatch is product drift, stale expectation, harness drift, obsolete scenario, future expectation, or environment/flaky.
2. State why the old expectation is no longer the current contract when rebaselining.
3. Preserve or improve coverage for externally visible behavior: result status, terminal classification, reason codes, evidence markers, transcript/continue summaries, cleanup, and redaction where applicable.

Before changing product code to satisfy a failing test:

1. Confirm the failure is product behavior drift under the current contract.
2. Add or preserve focused coverage for the intended contract.
3. Run adjacent lifecycle gates for the affected capability.

When extracting modules or performing behavior-preserving cleanup, add characterization coverage for externally visible shapes before relying on the extraction as safe. Pure projection, codec, planner, classifier, and result-surface extractions should preserve result status, reason codes, evidence markers, transcript/continue summaries, terminal classification, cleanup, and redaction semantics unless the route explicitly owns a contract change.

Discovered baseline drift must not remain an unclassified "pre-existing failure." It must be fixed, rebaselined, moved to backlog/pending documentation, or recorded in a relevant baseline/architecture note or final report with an owner, classification, and next action.

If a route touches broad integration behavior, result mapping, session/continue semantics, tool dispatch, permission/policy, or capability contracts, the final report should include baseline impact:

- focused gates run
- broad gates run or intentionally not run
- red tests discovered
- classification of relevant failures
- repaired, rebaselined, deferred, or newly introduced failures

Run the narrowest meaningful focused gates first. Run broad gates only when the route touches their contract area, when focused gates cannot cover the risk, or when the route is explicitly classifying baseline health.

## Validation Rules

Validation should distinguish:

- failures introduced by the current change
- failures relevant to the current runtime path
- pre-existing unrelated failures
- provider/network/config failures outside the product route

If a failure is pre-existing and unrelated, record it as such and do not automatically expand the task to fix it.

If validation produces audit/history residue, remove or restore it before finalizing.

Do not claim validation passed unless the command actually ran and passed.

## Real Provider Validation Rules

Run real-provider gates only when the change affects provider-facing behavior, runtime/CLI production routes, writer reachability, provider smoke scripts, or a claim about real-provider behavior.

Real-provider gates must:

- use explicit `PRIVATE_AGENTS_REAL_HOME`
- use isolated runtime/test directories
- avoid manually reading or printing real provider files
- check redaction
- verify repository cleanliness
- check for audit/history residue
- precisely classify failures

A real-provider run that reaches the provider path but fails with network errors is not a route failure. Record it as provider-network or equivalent. Do not retry repeatedly unless the task explicitly asks for a bounded retry.

## Stop Conditions

Stop expanding the round when the next step would require:

- a new persistence layer
- broad event protocol or taxonomy changes
- release/default gate changes
- moving control-plane semantics into Rust
- writing outside the intended workspace or test fixture
- changing provider/auth core
- full edit engine behavior
- multi-file/add/delete/move support
- rollback, AST patch, or fuzzy patch support
- broad CLI/session/provider architecture changes
- work that visibly drifts from the current runtime boundary

When a stop condition is reached, report the boundary and propose a separate plan or branch for that work.

## Reporting Requirements

If implementation is claimed complete, report:

- branch name and base commit when applicable
- files changed
- what changed in each file
- commands run
- command results
- real-provider gate results and attribution when applicable
- audit/history residue handling
- what was not run
- which runtime path or blocker was advanced
- remaining risks
- the single best next action

Do not present intention, design, or a skipped validation as completed implementation.

## Project State Files

`PROJECT_STATE.md` and `PLANS.*.md` are project-state aids, not automatic truth or route logs.

Use them to understand durable decisions, material blockers, and planned boundaries, but prefer evidence in this order:

1. current user instruction
2. current code
3. focused tests
4. actual validation output
5. recent commits in relevant files
6. project state documents
7. targeted reference-repository comparison

Update project state files sparingly, only when:

- a durable blocker materially changes
- a real runtime fact is established
- a long-lived boundary or contract materially changes
- the document is clearly behind code reality

Do not use `PROJECT_STATE.md`, `PLANS.*.md`, or `AGENTS.md` to record route logs, completed milestones, branch state, transient baseline counts, or future roadmap queues.
