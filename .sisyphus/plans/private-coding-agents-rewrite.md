# Private Coding Agents Rewrite Plan (TS Shell + Rust Core + Python Eval)

## TL;DR

> **Quick Summary**: Build a maintainable, solo-friendly private coding-agent system in two tracks: Phase-1 MVP in TypeScript (CLI-first, streaming, multi-agent skeleton, strict sandbox UX, pluggable model adapter, tri-stack tests), then Phase-2 Rust execution core migration behind stable contracts.
>
> **Deliverables**:
> - Windows-first CLI agent runtime with streaming sessions and interrupt/resume
> - Pluggable model provider layer (OpenAI-first)
> - Multi-agent handoff skeleton (planner/coder/reviewer)
> - Strict permission/sandbox escalation workflow
> - TS/Rust/Python minimal test infrastructure + E2E harness
> - Contract-first Rust daemon migration path (Phase-2)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves + final verification
> **Critical Path**: T1 (contracts) -> T4 (model adapter) -> T7 (agent loop) -> T10 (MVP E2E) -> T13 (Rust daemon) -> T15 (execution migration)

---

## Context

### Original Request
Rewrite ClaudeCode-like source into a private coding-agent product with:
- TS/Node as brain shell and orchestration layer
- Rust as high-performance execution core
- Python only for offline research/eval

### Interview Summary
**Confirmed Decisions**:
- MVP priority: CLI-first
- Deployment: single-machine local-first
- Security: strict sandbox default + explicit escalation
- Model strategy: pluggable provider adapter, OpenAI-first
- Platform: Windows-first
- Scope strategy: core subset first (not full parity)
- Team model: solo maintainer, long-term maintainability focus
- Rust daemon: **Phase-2**, not MVP blocker

**Research Findings**:
- Internal flow validated: `entrypoints/cli.tsx -> main.tsx -> setup.ts -> QueryEngine.ts/query.ts -> tools.ts/tasks.ts`
- `tools.ts` and `commands.ts` are high-coupling registries with heavy feature gating
- Strong extraction seams: task runtime, transport/IPC, scheduling layers
- Critical risks: schema drift, observability gaps, cross-runtime failure propagation

### Metis Review
**Identified Gaps (addressed in this plan)**:
- Missing boundary contracts -> Added contract-first task (T1)
- Undefined core subset -> Locked MVP must-haves into T3/T4/T5/T7/T10
- Missing Windows sandbox edge handling -> Added explicit sandbox policy and negative scenarios (T5, T14)
- Missing acceptance criteria/edge cases -> Added per-task happy + failure QA scenarios

---

## Work Objectives

### Core Objective
Deliver a stable, maintainable private coding-agent MVP on Windows using TS shell architecture and clear migration rails to a Rust execution core without breaking user workflows.

### Concrete Deliverables
- Versioned RPC/event contract spec for TS<->Rust and TS<->Python boundaries
- MVP CLI runtime with streaming UX, interrupt/resume, and multi-agent skeleton
- OpenAI-first provider adapter with pluggable interface
- Strict sandbox + explicit escalation policy enforcement in MVP path
- Minimal tri-stack automated tests and integration harness
- Phase-2 Rust daemon integration plan and execution-path migration steps

### Definition of Done
- [ ] MVP happy-path and failure-path E2E scenarios pass on Windows
- [ ] Model adapter can swap provider implementation without CLI refactor
- [ ] Sandbox blocks forbidden actions by default and prompts escalation
- [ ] Rust daemon can execute command task with timeout/cancel via contract API (Phase-2 checkpoint)

### Must Have
- CLI-first production path
- Contract-first interop boundaries
- Strict permission defaults and auditable escalation
- Automated tests in TS/Rust/Python

### Must NOT Have (Guardrails)
- No full ClaudeCode parity attempt in MVP
- No Python in online critical path
- No unversioned cross-runtime payloads
- No bypass of sandbox defaults for convenience

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - All verification is agent-executed via scripted scenarios.

### Test Decision
- **Infrastructure exists**: NO (in current snapshot)
- **Automated tests**: YES (tests-after for MVP tasks; contract tests early)
- **Framework**:
  - TS shell: Vitest
  - Rust core: cargo test
  - Python eval: pytest (offline-only harness)

### QA Policy
- CLI: interactive_bash (tmux) for end-to-end interaction and interrupt/resume
- API/daemon boundary: Bash (curl/pwsh command) against local IPC bridge wrappers
- Module contracts: Bash test runners (`npm/bun test`, `cargo test`, `pytest`)
- Evidence path: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Foundation + Contracts + MVP Skeleton):
- T1, T2, T3, T4, T5, T6

Wave 2 (MVP Integration + Reliability):
- T7, T8, T9, T10, T11, T12

Wave 3 (Phase-2 Rust Core Migration):
- T13, T14, T15, T16

Wave FINAL (Verification):
- F1, F2, F3, F4

### Dependency Matrix

- T1: Blocked By none -> Blocks T4, T8, T13
- T2: Blocked By none -> Blocks T3, T7, T9
- T3: Blocked By T2 -> Blocks T7, T10
- T4: Blocked By T1 -> Blocks T7, T11
- T5: Blocked By T1, T2 -> Blocks T8, T10, T14
- T6: Blocked By none -> Blocks T9, T10, T12
- T7: Blocked By T3, T4 -> Blocks T10, T11
- T8: Blocked By T1, T5 -> Blocks T10, T15
- T9: Blocked By T2, T6 -> Blocks T10
- T10: Blocked By T3, T5, T6, T7, T8, T9 -> Blocks T12, T15
- T11: Blocked By T4, T7 -> Blocks T12
- T12: Blocked By T6, T10, T11 -> Blocks T16
- T13: Blocked By T1 -> Blocks T14, T15
- T14: Blocked By T5, T13 -> Blocks T15
- T15: Blocked By T8, T10, T13, T14 -> Blocks T16
- T16: Blocked By T12, T15 -> Blocks FINAL

### Agent Dispatch Summary
- Wave 1: quick/unspecified-high/deep (contracts, scaffolding, security/testing base)
- Wave 2: deep + quick (orchestration, UX integration, QA harness)
- Wave 3: unspecified-high + deep (daemon + migration)
- FINAL: oracle + unspecified-high + deep

---

## TODOs

- [x] 1. Define versioned cross-runtime contracts (TS↔Rust, TS↔Python)

  **What to do**:
  - Create protocol schemas for commands, task lifecycle events, stream chunks, errors, permission prompts, and cancellation.
  - Add schema versioning policy (`major.minor.patch`) and compatibility rules.

  **Must NOT do**:
  - Do not use ad-hoc JSON payloads without schema version fields.

  **Recommended Agent Profile**:
  - **Category**: `deep` (contract correctness is load-bearing)
  - **Skills**: `system-design-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T4, T8, T13
  - **Blocked By**: None

  **References**:
  - `tools.ts` - tool input/output and permission context shape patterns.
  - `Task.ts` - task type/state contract surface.
  - `QueryEngine.ts` - message and stream event orchestration patterns.

  **Acceptance Criteria**:
  - [ ] Contract schema docs exist and include versioning + compatibility policy.
  - [ ] Contract validator tests exist and reject malformed payloads.

  **QA Scenarios**:
  - Scenario: valid payload acceptance
    Tool: Bash
    Steps: run schema validation test suite with valid fixtures.
    Expected: all valid fixtures pass.
    Evidence: `.sisyphus/evidence/task-1-valid-schema.txt`
  - Scenario: invalid payload rejection
    Tool: Bash
    Steps: run validation against missing `schemaVersion` fixture.
    Expected: explicit validation error code returned.
    Evidence: `.sisyphus/evidence/task-1-invalid-schema-error.txt`

- [x] 2. Scaffold repository structure for TS shell / Rust core / Python eval

  **What to do**:
  - Establish maintainable workspace layout and ownership boundaries.
  - Add build/run/test entry commands for each layer.

  **Must NOT do**:
  - Do not couple Rust/Python internals into TS package imports.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `system-design-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T3, T7, T9
  - **Blocked By**: None

  **References**:
  - `entrypoints/cli.tsx` - startup path expectations.
  - `setup.ts` - initialization sequencing pattern.

  **Acceptance Criteria**:
  - [ ] Repo structure documented with clear ownership per language.
  - [ ] Root task runner commands call layer-specific scripts/tests.

  **QA Scenarios**:
  - Scenario: workspace bootstrap
    Tool: Bash
    Steps: run project bootstrap command and verify all layer folders/config files exist.
    Expected: command exits 0 and structure matches spec.
    Evidence: `.sisyphus/evidence/task-2-bootstrap.txt`
  - Scenario: missing layer detection
    Tool: Bash
    Steps: run validation script with one required folder temporarily absent.
    Expected: validation fails with actionable message.
    Evidence: `.sisyphus/evidence/task-2-missing-layer-error.txt`

- [x] 3. Implement CLI-first streaming shell baseline (Windows-first)

  **What to do**:
  - Create CLI input loop, streaming output renderer, interrupt and resume semantics.
  - Add session metadata persistence for local-first usage.

  **Must NOT do**:
  - Do not build full TUI/GUI scope in MVP.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7, T10
  - **Blocked By**: T2

  **References**:
  - `entrypoints/cli.tsx` - fast-path and mode routing patterns.
  - `main.tsx` - interactive/headless branch handling.
  - `interactiveHelpers.tsx` - render/run lifecycle patterns.

  **Acceptance Criteria**:
  - [ ] Streaming output arrives incrementally without blocking input loop.
  - [ ] Ctrl+C behavior is deterministic (cancel run, keep shell alive).

  **QA Scenarios**:
  - Scenario: streaming happy path
    Tool: interactive_bash
    Steps: start CLI session, send prompt, assert chunked output appears over time.
    Expected: at least 3 incremental chunks before completion marker.
    Evidence: `.sisyphus/evidence/task-3-stream-happy.txt`
  - Scenario: interrupt behavior
    Tool: interactive_bash
    Steps: start long response, send Ctrl+C, submit next prompt.
    Expected: first run marked cancelled; second prompt succeeds.
    Evidence: `.sisyphus/evidence/task-3-interrupt-error.txt`

- [x] 4. Build pluggable model adapter (OpenAI-first)

  **What to do**:
  - Implement provider interface and OpenAI adapter.
  - Add provider capability metadata and fallback/error normalization.

  **Must NOT do**:
  - Do not hardwire provider-specific payloads into orchestration logic.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `system-design-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7, T11
  - **Blocked By**: T1

  **References**:
  - `query.ts` - request/response orchestration lifecycle.
  - `services/api/*` patterns - retry/fallback error handling conventions.

  **Acceptance Criteria**:
  - [ ] OpenAI adapter supports streaming and tool-call envelope mapping.
  - [ ] Provider swap requires config change only (no loop refactor).

  **QA Scenarios**:
  - Scenario: adapter streaming success
    Tool: Bash
    Steps: run provider integration test with OpenAI mock/live key fixture.
    Expected: normalized stream events produced in adapter contract format.
    Evidence: `.sisyphus/evidence/task-4-openai-stream.txt`
  - Scenario: provider failure normalization
    Tool: Bash
    Steps: inject 429/500 responses.
    Expected: normalized retriable/non-retriable error classes.
    Evidence: `.sisyphus/evidence/task-4-provider-error.txt`

- [x] 5. Implement strict sandbox + explicit escalation workflow (TS path)

  **What to do**:
  - Define default-deny policy (filesystem/network/process caps) for MVP.
  - Implement escalation prompt and decision audit trail.

  **Must NOT do**:
  - Do not permit silent auto-escalation.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `security-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T10, T14
  - **Blocked By**: T1, T2

  **References**:
  - `tools.ts` - permission filtering and deny-rule prefilter pattern.
  - `utils/permissions/*` - policy resolution patterns.

  **Acceptance Criteria**:
  - [ ] Disallowed operations blocked by default.
  - [ ] Escalation requires explicit confirmation and is logged.

  **QA Scenarios**:
  - Scenario: default deny
    Tool: interactive_bash
    Steps: request out-of-workspace write and network call.
    Expected: both denied with policy reason.
    Evidence: `.sisyphus/evidence/task-5-deny-happy.txt`
  - Scenario: escalation rejection
    Tool: interactive_bash
    Steps: trigger escalation prompt, choose deny.
    Expected: operation aborted, audit entry recorded.
    Evidence: `.sisyphus/evidence/task-5-escalation-deny-error.txt`

- [x] 6. Establish tri-stack minimal test infrastructure (TS/Rust/Python)

  **What to do**:
  - Configure TS test runner, Rust cargo test, Python pytest harness.
  - Add smoke tests for each stack and a unified test command.

  **Must NOT do**:
  - Do not rely on manual-only validation.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `testing-skills`, `python-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T9, T10, T12
  - **Blocked By**: None

  **References**:
  - User-provided interpreter: `D:\conda-envs\coding_agents\python.exe`

  **Acceptance Criteria**:
  - [ ] Single command runs TS, Rust, Python test suites.
  - [ ] CI/local script fails fast on any stack failure.

  **QA Scenarios**:
  - Scenario: all-stack smoke pass
    Tool: Bash
    Steps: run unified test command.
    Expected: TS/Rust/Python smoke suites all pass.
    Evidence: `.sisyphus/evidence/task-6-tristack-pass.txt`
  - Scenario: one-stack failure propagation
    Tool: Bash
    Steps: induce failing Python test and rerun unified command.
    Expected: non-zero exit and clear failing stack attribution.
    Evidence: `.sisyphus/evidence/task-6-python-fail-error.txt`

- [x] 7. Build multi-agent orchestration skeleton (planner/coder/reviewer)

  **What to do**:
  - Implement role-specific prompts and handoff protocol.
  - Add cycle guard and max-turn policies.

  **Must NOT do**:
  - Do not include autonomous infinite loops.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `system-design-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T11
  - **Blocked By**: T3, T4

  **References**:
  - `commands.ts` - command composition and dispatch patterns.
  - `tasks/LocalAgentTask/*` - background agent progress/state patterns.

  **Acceptance Criteria**:
  - [ ] Planner->Coder->Reviewer handoff works with preserved context.
  - [ ] Handoff cycles are detected and stopped.

  **QA Scenarios**:
  - Scenario: successful handoff chain
    Tool: interactive_bash
    Steps: run orchestrated task requiring three roles.
    Expected: all roles execute in order; final consolidated output produced.
    Evidence: `.sisyphus/evidence/task-7-handoff-happy.txt`
  - Scenario: cycle prevention
    Tool: interactive_bash
    Steps: craft prompt causing recursive handoff pattern.
    Expected: cycle guard stops run with explicit reason.
    Evidence: `.sisyphus/evidence/task-7-cycle-error.txt`

- [x] 8. Implement minimal tool registry + permission-aware dispatch for MVP toolset

  **What to do**:
  - Define MVP tool allowlist (read/edit/bash/git-like minimal set).
  - Implement dispatch path that enforces sandbox policy and contract envelope.

  **Must NOT do**:
  - Do not expose non-reviewed tools in MVP.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `security-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T15
  - **Blocked By**: T1, T5

  **References**:
  - `tools.ts` - base tools and gating patterns.
  - `Tool.ts` - tool context/call contract.

  **Acceptance Criteria**:
  - [ ] Only MVP allowlisted tools are visible to agents.
  - [ ] Tool deny rules prevent forbidden calls before execution.

  **QA Scenarios**:
  - Scenario: allowlisted tool usage
    Tool: interactive_bash
    Steps: request read/edit operations through agent.
    Expected: tool calls execute and results stream normally.
    Evidence: `.sisyphus/evidence/task-8-allowlist-happy.txt`
  - Scenario: blocked tool usage
    Tool: interactive_bash
    Steps: request non-allowlisted tool.
    Expected: rejection occurs pre-execution with policy explanation.
    Evidence: `.sisyphus/evidence/task-8-deny-error.txt`

- [x] 9. Implement session state and interrupt/resume reliability

  **What to do**:
  - Persist active session metadata and command state snapshots.
  - Restore recent sessions and unfinished task metadata on restart.

  **Must NOT do**:
  - Do not auto-resume canceled tasks without explicit confirmation.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T10
  - **Blocked By**: T2, T6

  **References**:
  - `utils/sessionStorage*` usage patterns in existing runtime.
  - `main.tsx` resume/restore flow branches.

  **Acceptance Criteria**:
  - [ ] Interrupted run state is recoverable.
  - [ ] Resume command restores context without corruption.

  **QA Scenarios**:
  - Scenario: restart + resume
    Tool: interactive_bash
    Steps: start run, terminate process, relaunch, resume.
    Expected: session metadata restored and new prompt continues.
    Evidence: `.sisyphus/evidence/task-9-resume-happy.txt`
  - Scenario: corrupt session file
    Tool: Bash
    Steps: inject invalid snapshot JSON and invoke resume.
    Expected: graceful fallback with explicit recovery guidance.
    Evidence: `.sisyphus/evidence/task-9-corrupt-error.txt`

- [x] 10. Deliver MVP end-to-end flow integration and acceptance suite

  **What to do**:
  - Integrate T3/T4/T5/T7/T8/T9 into one MVP command flow.
  - Create E2E acceptance suite for selected core subset behaviors.

  **Must NOT do**:
  - Do not silently skip failing scenario branches.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `testing-skills`, `system-design-skills`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 critical integration
  - **Blocks**: T12, T15
  - **Blocked By**: T3, T5, T6, T7, T8, T9

  **References**:
  - `QueryEngine.ts` and `query.ts` - turn lifecycle integration patterns.

  **Acceptance Criteria**:
  - [ ] One scripted scenario covers full loop: prompt -> handoff -> tool approval -> streamed result.
  - [ ] Negative scenario verifies policy denial path and recovery prompt.

  **QA Scenarios**:
  - Scenario: full MVP happy path
    Tool: interactive_bash
    Steps: run scripted E2E scenario with allowlisted task.
    Expected: successful completion with streamed output and final summary.
    Evidence: `.sisyphus/evidence/task-10-e2e-happy.txt`
  - Scenario: forbidden operation in flow
    Tool: interactive_bash
    Steps: inject disallowed tool request during flow.
    Expected: denial shown; run continues with safe alternative.
    Evidence: `.sisyphus/evidence/task-10-e2e-error.txt`

- [x] 11. Add provider abstraction hardening + fallback policy

  **What to do**:
  - Add provider capability negotiation and standardized retry/backoff policy.
  - Add graceful degradation behavior when provider unavailable.

  **Must NOT do**:
  - Do not couple fallback policy to one provider error format.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T12
  - **Blocked By**: T4, T7

  **References**:
  - existing retry/failure handling style in `services/api/*` and `query.ts`.

  **Acceptance Criteria**:
  - [ ] Retry/backoff policy documented and tested.
  - [ ] Provider outage yields deterministic fallback outcome.

  **QA Scenarios**:
  - Scenario: transient provider failure
    Tool: Bash
    Steps: run tests with mocked 429/timeout errors.
    Expected: retries applied and final status reported correctly.
    Evidence: `.sisyphus/evidence/task-11-retry-happy.txt`
  - Scenario: prolonged outage
    Tool: Bash
    Steps: force persistent provider failure.
    Expected: graceful failure classification, no crash.
    Evidence: `.sisyphus/evidence/task-11-outage-error.txt`

- [x] 12. Add observability baseline (trace IDs, structured logs, metrics hooks)

  **What to do**:
  - Introduce consistent correlation IDs through CLI, orchestration, provider, tool calls.
  - Add structured logging fields and minimal runtime metrics.

  **Must NOT do**:
  - Do not log secrets or raw API keys.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `security-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 late
  - **Blocks**: T16
  - **Blocked By**: T6, T10, T11

  **References**:
  - telemetry/logging patterns in `main.tsx` and `setup.ts`.

  **Acceptance Criteria**:
  - [ ] All major lifecycle events carry correlation IDs.
  - [ ] Secret redaction tests pass.

  **QA Scenarios**:
  - Scenario: trace continuity
    Tool: Bash
    Steps: execute E2E scenario and inspect logs.
    Expected: same trace ID appears across turn lifecycle events.
    Evidence: `.sisyphus/evidence/task-12-trace-happy.txt`
  - Scenario: secret redaction
    Tool: Bash
    Steps: inject fake API token in input and inspect logs.
    Expected: token masked/redacted in emitted logs.
    Evidence: `.sisyphus/evidence/task-12-redaction-error.txt`

- [x] 13. Build Rust daemon v1 skeleton with command execution + timeout/cancel

  **What to do**:
  - Implement long-running Rust daemon process lifecycle.
  - Add command execution API with timeout, cancellation, and structured result payload.

  **Must NOT do**:
  - Do not migrate all execution paths yet; keep feature-gated.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T14, T15
  - **Blocked By**: T1

  **References**:
  - `Task.ts` / `tasks.ts` for lifecycle semantics.

  **Acceptance Criteria**:
  - [ ] Daemon can run command, stream output, and return exit status.
  - [ ] Timeout and cancel paths terminate child process reliably.

  **QA Scenarios**:
  - Scenario: daemon execution success
    Tool: Bash
    Steps: submit short command via daemon API.
    Expected: exit code 0 and captured stdout.
    Evidence: `.sisyphus/evidence/task-13-daemon-happy.txt`
  - Scenario: timeout cancellation
    Tool: Bash
    Steps: submit long-running command with low timeout.
    Expected: process terminated; timeout status returned.
    Evidence: `.sisyphus/evidence/task-13-timeout-error.txt`

- [x] 14. Implement Rust-side sandbox enforcement + escalation propagation

  **What to do**:
  - Enforce default-deny permissions in daemon execution path.
  - Route escalation requests back to TS shell for explicit user decision.

  **Must NOT do**:
  - Do not bypass TS approval workflow for escalations.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `security-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T15
  - **Blocked By**: T5, T13

  **References**:
  - policy semantics from T5 implementation.

  **Acceptance Criteria**:
  - [ ] Rust path enforces same policy outcomes as TS path.
  - [ ] Escalation request round-trip is auditable.

  **QA Scenarios**:
  - Scenario: policy parity success
    Tool: Bash
    Steps: run allowed command through daemon sandbox.
    Expected: command succeeds and logs policy check pass.
    Evidence: `.sisyphus/evidence/task-14-sandbox-happy.txt`
  - Scenario: forbidden operation in daemon
    Tool: Bash
    Steps: run disallowed network/file command.
    Expected: blocked with policy code and escalation prompt event.
    Evidence: `.sisyphus/evidence/task-14-sandbox-error.txt`

- [x] 15. Migrate execution path to TS↔Rust bridge behind feature flag

  **What to do**:
  - Introduce feature flag for daemon execution path.
  - Route tool/task execution through contract bridge with rollback switch.

  **Must NOT do**:
  - Do not remove TS fallback path until parity is proven.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `system-design-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 integration
  - **Blocks**: T16
  - **Blocked By**: T8, T10, T13, T14

  **References**:
  - routing points in `main.tsx`, `tools.ts`, `tasks.ts`.

  **Acceptance Criteria**:
  - [ ] Feature flag can toggle TS and Rust execution paths.
  - [ ] Functional parity checks pass for selected MVP flows.

  **QA Scenarios**:
  - Scenario: flag-on daemon path
    Tool: interactive_bash
    Steps: enable daemon flag, run MVP E2E suite.
    Expected: suite passes with Rust path active.
    Evidence: `.sisyphus/evidence/task-15-flag-on-happy.txt`
  - Scenario: rollback fallback
    Tool: interactive_bash
    Steps: disable daemon flag after injected daemon fault.
    Expected: TS fallback path restores functionality.
    Evidence: `.sisyphus/evidence/task-15-rollback-error.txt`

- [x] 16. Harden reliability/performance and freeze v1 release checklist

  **What to do**:
  - Add stability guardrails (backpressure, queue limits, timeout hierarchy).
  - Finalize release checklist, operational runbook, and known limitations.

  **Must NOT do**:
  - Do not optimize unmeasured paths without baseline metrics.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `performance-skills`, `testing-skills`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 closeout
  - **Blocks**: FINAL
  - **Blocked By**: T12, T15

  **References**:
  - queue/timeout orchestration patterns in existing `query.ts` and task framework.

  **Acceptance Criteria**:
  - [ ] Load/stability smoke thresholds documented and met.
  - [ ] Release checklist and rollback procedures complete.

  **QA Scenarios**:
  - Scenario: sustained run stability
    Tool: Bash
    Steps: run repeated scripted sessions under moderate concurrency.
    Expected: no hangs/crashes, bounded queue growth.
    Evidence: `.sisyphus/evidence/task-16-stability-happy.txt`
  - Scenario: overload protection
    Tool: Bash
    Steps: exceed configured queue/concurrency limits.
    Expected: graceful rejection/backpressure, no data corruption.
    Evidence: `.sisyphus/evidence/task-16-overload-error.txt`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real QA Execution** — `unspecified-high` (+ `playwright` if needed)
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- C1 (Wave 1): `feat(contracts): add versioned runtime boundary spec and scaffolding`
- C2 (Wave 2): `feat(mvp-cli): add streaming multi-agent shell with strict permission workflow`
- C3 (Wave 3): `feat(rust-core): add daemon execution path and gated migration`
- C4 (Final): `test(e2e): add cross-runtime verification and hardening`

---

## Success Criteria

### Verification Commands
```bash
# TS
vitest run

# Rust
cargo test

# Python
"D:\conda-envs\coding_agents\python.exe" -m pytest
```

### Final Checklist
- [ ] All MVP must-haves are implemented
- [ ] Sandbox default-deny behavior proven by negative tests
- [ ] Cross-runtime contracts versioned and validated
- [ ] Rust daemon migration gate works and is reversible
- [ ] Tri-stack tests pass in automated runs
