# Draft: Private Coding Agents Rewrite (TS + Rust + Python)

## Requirements (confirmed)
- User goal: rewrite ClaudeCode-style source into a private coding agents system.
- Primary stack split requested:
  - TypeScript/Node: CLI/TUI, streaming conversation, tool registry, MCP client/gateway, shell orchestration, plan-act-observe orchestration, multi-agent handoff, WebSocket/desktop shell comms.
  - Rust: command execution daemon, sandbox/permissions, fs watcher + large repo scanning, diff/patch/apply engine, indexing/cache/incremental analysis, concurrent queue, long-lived daemon, rate limits/timeouts/cancellation/graceful shutdown.
  - Python: research/eval only (prompt/policy experiments, offline eval, data replay/cleaning, benchmark scripts, tool PoCs), not in main execution path.
- User provided Python interpreter path: `D:\conda-envs\coding_agents\python.exe`.

## Technical Decisions (proposed by user)
- Keep product runtime path on TS + Rust.
- Keep Python out of latency-sensitive online path.
- Prioritize reliability/concurrency in Rust core.

## Technical Decisions (confirmed in interview)
- MVP priority: **CLI-first**.
- Deployment shape: **single-machine local-first**.
- Security baseline: **strict sandbox by default** (least privilege + explicit elevation + auditing).
- Model strategy: **pluggable multi-provider** (OpenAI first, with extensible adapter boundary).
- Platform scope (phase-1): **Windows-first**.
- Product strategy: **core subset first** (not full compatibility upfront).
- Test strategy: **build test infrastructure in phase-1**.
- Delivery mode: **single maintainer**, prioritize balanced scope/quality and long-term maintainability.

## Research Findings
- Local repository is a source-only snapshot; missing normal build/test manifests in working tree.
- Core files identified for architecture reference:
  - `entrypoints/cli.tsx`
  - `main.tsx`
  - `setup.ts`
  - `QueryEngine.ts`
  - `query.ts`
  - `commands.ts`
  - `tools.ts`

## Research In Progress
- Launched parallel architecture/context probes:
  - `bg_29fed145`: internal execution-flow + extraction seams (**cancelled by agent runtime**)
  - `bg_0ecbc96c`: tool registry + MCP + shell/task orchestration inventory
  - `bg_f75aa84e`: TS OpenAI Agents SDK + Node architecture patterns
  - `bg_e07143c1`: Rust daemon design (Tokio, cancellation, sandboxing, indexing)
  - `bg_f6d565ce`: architecture strategy critique + migration go/no-go
  - `bg_5f20dfd6`: replacement run for execution-flow + extraction seams

## Research Findings (new)
- Internal inventory confirms `tools.ts` as tool source-of-truth and `commands.ts` as command registry with extensive feature gating and lazy requires.
- Task orchestration currently centered around `tasks.ts`, `Task.ts`, and concrete task implementations under `tasks/`.
- MCP path is deep and coupled via `services/mcp/client.ts` and MCP tool wrappers; extraction requires explicit boundary contracts.
- External analysis suggests **Conditional GO** for TS+Rust+Python, with strongest caveats:
  - prevent schema drift via versioned contracts,
  - enforce end-to-end observability from day 1,
  - keep Python optional/off critical path,
  - use phased strangler migration with fallback switches.

## Architecture Boundary Findings (from replacement deep analysis)
- Execution flow (verified):
  - `entrypoints/cli.tsx` (fast paths / mode split) -> `main.tsx` (preAction/init + mode routing) -> `setup.ts` -> interactive (`interactiveHelpers.tsx`) or headless (`cli/print.ts`) -> `QueryEngine.ts`/`query.ts` -> `tools.ts`/`tasks.ts` -> IO + MCP.
- Extraction seams:
  - **SAFE_NOW**: headless stream runtime shell, MCP transport/connection manager, task runtime manager, tool scheduling layer.
  - **LATER**: query compaction/continuation state machine, provider API behavior, session persistence/recovery.
  - **KEEP_IN_TS**: CLI command graph, interactive Ink/TUI stack, trust/setup UX glue.
- Registry/state hazards:
  - dynamic command composition + cache invalidation complexity in `commands.ts`;
  - tool gating combines feature flags/env/permission context in `tools.ts`;
  - broad mutable singleton state in `bootstrap/state.ts` can cause split-brain if ownership is not explicit.
- Suggested migration slices (ordered):
  1) daemon skeleton + RPC health;
  2) headless IO control plane;
  3) task lifecycle manager;
  4) MCP connection manager;
  5) tool orchestration scheduler;
  6) query-engine facade boundary;
  7) compaction/continuation migration;
  8) provider API path migration.

## Test Strategy Decision (pending confirmation)
- **Infrastructure exists**: NO (in this snapshot no test framework/config discovered).
- **Decision needed**:
  - Set up test infrastructure now (preferred) vs defer.
  - If setup now, choose primary framework split:
    - TS shell: Vitest/Jest
    - Rust core: cargo test + integration harness
    - Python eval: pytest (offline only)
- **Agent-Executed QA**: mandatory for all implementation tasks (CLI/API/daemon scenarios with evidence capture).

## Scope Boundaries (draft)
- INCLUDE: feasibility analysis, architecture decomposition, phased implementation plan, task objectives.
- EXCLUDE (pending confirmation): immediate code implementation/migration in this turn.

## Scope Boundaries (refined)
- INCLUDE:
  - private coding-agent architecture and migration plan,
  - TS shell / Rust core / Python eval boundaries,
  - contract-first execution roadmap,
  - MVP-first task sequencing under solo-maintainer constraints.
- EXCLUDE:
  - one-shot full ClaudeCode feature parity in phase-1,
  - immediate full-platform rollout (macOS/Linux deferred),
  - putting Python in latency-sensitive online path.

## MVP Must-Have Selection (user confirmed)
- multi-agent orchestration skeleton (minimal planner/coder/reviewer handoff)
- pluggable model adapter layer (OpenAI-first, provider interface retained)
- strict sandbox + explicit privilege escalation workflow
- streaming CLI session experience (state/progress/interrupt-resume)
- minimum tri-stack test infrastructure (TS/Rust/Python)

## Current Planning Tension to Resolve
- User prefers core-subset MVP and did **not** include Rust daemon v1 in must-have list.
- Original architecture intent still includes Rust as high-performance execution core.
- Need explicit confirmation whether Rust daemon is:
  1) required in MVP, or
  2) moved to phase-2 after MVP shell + contracts are stable.

## Open Questions
- Target platform matrix (Windows/macOS/Linux) and packaging strategy.
- Compatibility target: CLI parity vs subset MVP.
- Security profile: local-only vs enterprise multi-tenant.
- Model/provider strategy and data retention policy.
- First milestone timeline and team size.
