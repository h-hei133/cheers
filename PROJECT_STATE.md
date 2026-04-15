# PROJECT_STATE.md

## 1. Current Stage Positioning

- Project name: private-coding-agents
- Current stage mainline: user-minimal real main path closure
- Default working mode in this stage: Implementation first; State-Recovery only when factual state is unclear
- The default mainline is no longer local runtime hardening / proof-family closure
- The current goal is not to build a simplified toy agent that merely runs, but to move the real user path toward continuous usability while staying aligned with ClaudeCode-grade load-bearing architecture

## 2. Repository and Reference Boundaries

- Read-only reference repo:
  - `D:\LenovoSoftstore\pyproject\source-claudecode`
- Writable working repo:
  - `D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents`

Boundary rules:

- The ClaudeCode snapshot is used to recover load-bearing runtime semantics, responsibility boundaries, and lifecycle truth
- The private project directory is the only place where code may actually be modified, validated, and diffed
- Do not trade away ClaudeCode-grade load-bearing semantics just to make a demo path appear usable
- Do not mechanically mirror ClaudeCode file structure either

## 3. Architectural Position

### TypeScript = control plane

Includes but is not limited to:

- shell
- session
- orchestration
- slash command
- recovery
- permission UX
- MCP capability routing
- runtime durability / replay / recovery semantics

### Rust = execution plane

Includes but is not limited to:

- daemon
- command execution
- timeout
- cancel
- sandbox preflight
- execution responsibility

### contracts = cross-runtime semantic boundary

Default rules:

- replay / recovery / orchestration / transcript re-entry / durability stay in the TS control plane
- only clear execution responsibility goes into Rust
- do not push control-plane semantics into Rust for local convenience
- do not break TS / Rust / contracts boundaries just to achieve short-term pathability

## 4. User-Minimal Real Main Path (6 Steps)

All implementation work in this stage should directly serve at least one of the following steps:

1. The user starts the CLI in a clean runnable environment and sees clear runtime mode and session state
2. The user creates a new session or resumes an interrupted one, and session health is checked first; broken sessions must not pollute the current flow
3. The user enters a real task, and the system enters a unified query loop
4. The system uses a real model and real toolchain; permission escalation is explicitly approved or denied by the user, not inferred from prompt keywords
5. The system emits a clear terminal state (success / stopped / error) and persists it; errors are actionable and retryable
6. The user can continue the next turn or resume after interruption with consistent semantics and without manual repair

## 5. Current Top 3 Blockers

Unless new evidence overrides them, the current stage should default to choosing work from these three blockers first.

### Blocker 1

- The default happy-path still lacks a repeatedly proven real-task chain under real provider mode (with explicit approval + durable terminal) outside narrow scripted slices
- Directly affects main-path steps: 3 / 4 / 5
- Current judgment:
  - This is the heaviest blocker and the best default priority
  - If this is not addressed first, later hardening continues to reinforce partial slices rather than a continuously usable default path

### Blocker 2

- The approval loop has moved to explicit user-driven callback in CLI, but synthetic decision fallback still exists in non-interactive/integration call paths and remains a semantic drift risk
- Directly affects main-path steps: 4 / 5 / 6
- Current judgment:
  - This remains the second-priority blocker
  - The next reduction target is to constrain synthetic fallback to explicit test harness use and keep production/default path user-driven

### Blocker 3

- Session corruption handling has improved (aggregated unreadable-directory warning), but the broader resume trust boundary is not yet closed for long-lived noisy environments
- Directly affects main-path steps: 1 / 2 / 6
- Current judgment:
  - This is currently the third-priority blocker
  - It does not outrank default real-path closure yet, but it will become high-frequency as soon as real usage grows

## 6. Confirmed Foundation Capabilities

The following capabilities should currently be treated as foundation, not as the default place to keep digging for more micro-proofs:

- a unified query loop exists
- terminal persistence / terminal classification baseline exists
- replay / recovery substrate exists
- pending lifecycle reconcile / compensation / resume baseline semantics exist
- durableStatus has started carrying clearer durable semantics than coarse top-level status
- MCP stale capability execute rejection has targeted proof
- rust-daemon / ts-local / ts-local-fallback failure metadata has reached a minimum consistency proof
- CLI real-provider readiness pre-query gate exists, including actionable missing-key/auth/network terminal mapping
- CLI explicit user approval callback path is wired and persisted through terminal evidence
- startup handling for unreadable session directories now uses aggregated warning to reduce noise
- a golden main-path smoke gate is wired into workspace test entry (`test:gate:golden-main-path`)
- targeted tests for provider readiness and shell runtime behavior pass on the current working tree

Interpretation:

- These capabilities mean the project is not missing all foundations
- But they do not automatically mean the project is close to continuous real use
- This stage should not keep defaulting to deeper proof work inside these families unless they directly block the real main path

## 7. Current Most Important Factual Judgments

### Confirmed

- The project has moved from pure integrated-demo leaning toward a partial real-path baseline at CLI entry
- The main current risk is no longer that local runtime semantics are too weak in isolation, but that the real user path is not yet the default path
- Continuing to default to local hardening/proof work still produces diminishing returns relative to main-path closure
- The current stage must shift its center of gravity toward:
  - moving the default main execution path back to real-task semantics
  - constraining synthetic approval fallback to test-only contexts
  - improving session corruption handling enough that bad sessions do not pollute the current path

### Still Unverified

- Along the default CLI entry -> unified query loop path, whether one full real-provider success path is repeatedly stable without relying on synthetic provider mode
- Which non-CLI call paths still depend on synthetic escalation decisions and should be explicitly fenced as test-only
- The minimal fix point where session corruption handling becomes operationally “good enough” in large/noisy local histories

## 8. Things the Current Stage Should Not Default To

Unless they directly block the user-minimal real main path, do not default to the following:

- do not keep adding same-family local runtime hardening cases, especially where targeted tests are already green
- do not prioritize document sync above implementation closure
- do not do project-level audits, roadmap expansion, or broad refactors
- do not expand naming systems / state taxonomy unless that expansion directly blocks the main path
- do not do UI / rendering polish unrelated to the minimal main path
- do not keep closing acceptance-surface / invariant-family / micro-boundary slices unless they directly block the current main path
- do not use test-only work as the default mainline progression pattern

## 9. Current Preferred Action

- Action title:
  - Close one repeatedly stable default real-task success chain under real provider mode on CLI
- Corresponding main-path steps:
  - 3. The user enters a real task and the system enters a unified query loop
  - 4. The system uses a real model and real toolchain with explicit approval
  - 5. The system emits and persists a clear terminal state
- Corresponding blocker:
  - Blocker 1: the main execution flow still leans toward integrated-demo semantics instead of default real-task semantics
- Current objective:
  - Ensure at least one allowlisted real task intent can repeatedly pass through CLI default path with real provider + explicit approval callback + success durable terminal evidence
  - Keep failure path strict and actionable when real provider readiness fails, without silently falling back into synthetic semantics
- Why this is the current best priority:
  - It shortens the distance to “a user can continuously complete a real task” more directly than continuing local runtime hardening
  - It does not discard existing runtime hardening work; it begins to make that work serve the real main path
  - It best matches the current stage goal: real user path closure while staying aligned with ClaudeCode load-bearing semantics

## 10. Current Secondary Actions

### Secondary 1

- Action title:
  - Fence synthetic escalation decision paths to test harness use; keep default runtime approval explicitly user-driven
- Corresponding blocker:
  - Blocker 2

### Secondary 2

- Action title:
  - Continue session corruption isolation work from aggregated startup warning toward stronger resume trust boundaries
- Corresponding blocker:
  - Blocker 3

## 11. Near-Term Risks

- making the path look usable by introducing temporary implementations that drift away from ClaudeCode load-bearing semantics
- slipping back into local runtime hardening as the default mainline just to preserve a feeling of progress
- failing to actually move the default path back to real-task semantics, and instead only adding a parallel side-path
- creating an approval loop that appears usable on the surface but still depends on prompt keywords or synthetic branches
- leaving synthetic fallback behavior reachable from non-test execution paths
- leaving session corruption handling too weak, so that once the real path begins to be used, experience degrades quickly
- over-trusting targeted green tests and misreading that as “close to continuously usable”

## 12. Update Rules

Only update this file when one of the following becomes true:

- the top 3 blockers materially change
- the stage judgment for the six-step main path materially changes
- a confirmed fact materially changes
- the current preferred action changes
- code reality has clearly falsified the current stage judgment

Otherwise, do not rewrite this file frequently.
Do not turn it into an audit log or a roadmap document.
