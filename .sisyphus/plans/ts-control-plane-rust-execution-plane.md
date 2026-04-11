# TS Control Plane / Rust Execution Plane Plan

## Goal

Freeze TypeScript as the long-term **control plane** and move Rust onto the mainline as the **execution plane**, without allowing Rust to absorb shell/session/orchestration concerns.

## Architectural Position

### TypeScript owns
- CLI and shell interaction
- session substrate, replay, recovery
- query orchestration and agent handoff
- slash commands and shell actions
- permission prompts, audit UX, recovery UX
- MCP capability exposure and routing policy

### Rust owns
- long-lived execution daemon
- command execution lifecycle
- timeout / cancel enforcement
- execution resource control
- execution isolation / sandbox preflight / process-level safety
- IPC boundary for TS-requested execution

### Python remains
- offline eval / replay / benchmarking only
- never enters online critical path

## Core Rule

Every upcoming task must answer:
- **Control plane?** → keep in TS
- **Execution plane?** → migrate to Rust through contract

---

## Ordered Workstreams

- [x] 1. Stabilize TS as the control plane
  - Finish transcript durability / replay semantics
  - Keep shell/bootstrap/session/action/query state coherent
  - Ensure tool visibility and MCP capability routing stay TS-owned

- [x] 2. Promote Rust to the real execution plane
  - Replace bash-style/local fallback mentality with daemon-first execution semantics
  - Make Rust the canonical executor for command/process workloads
  - Preserve TS as the caller, approver, and presenter

- [x] 3. Establish TS ↔ Rust contract parity
  - Align timeout/cancel/error/result/audit semantics
  - Ensure the same execution request means the same thing on both sides
  - Make parity testable, not assumed

---

## Workstream 1 — TS Control Plane Stabilization

### Objective
Make the current TS runtime trustworthy enough to host Rust cleanly, without further control-plane drift.

### Tasks
- [x] 1.1 Transcript durability and replay hardening
  - strengthen append-before-model-call semantics
  - distinguish interrupted prompt vs interrupted turn
  - add replay/recovery helpers over `transcript.jsonl`

- [x] 1.2 Shell/bootstrap/session coherence
  - keep bootstrap phases explicit
  - reduce entrypoint logic further into `core/shell`
  - make session/worktree/bootstrap state transitions more atomic

- [x] 1.3 Command/action consolidation
  - keep slash commands as typed shell actions
  - avoid feature sprawl; only actions that help control-plane reliability

### Acceptance Criteria
- TS can recover a session without guessing from model output
- shell runtime behavior is reproducible from stored state + transcript
- CLI remains a thin IO layer over core runtime modules

---

## Workstream 2 — Rust Execution Plane Mainline

### Objective
Make Rust the canonical execution backend for process/tool execution workloads while TS remains the decision-maker.

### Tasks
- [x] 2.1 Daemon-first execution routing
  - move from “optional rust path” toward “preferred rust execution backend” for execution-heavy tools
  - keep fallback behavior explicit and observable

- [x] 2.2 Execution request contract tightening
  - formalize command request / result / timeout / cancel / sandbox denial / execution metadata
  - ensure all execution requests are contract-shaped before crossing boundary

- [x] 2.3 Expand Rust execution coverage
  - start with shell/process execution
  - then absorb more execution-heavy operations only if they clearly belong to execution plane

### Acceptance Criteria
- TS requests execution; Rust performs execution
- timeout/cancel are enforced by Rust, not simulated in TS
- daemon-first path is verifiable in tests and evidence

### Guardrails
- Rust must NOT take over:
  - session substrate
  - slash command routing
  - permission prompt UX
  - query orchestration
  - MCP capability policy

---

## Workstream 3 — TS/Rust Contract Parity

### Objective
Make contract behavior the system backbone, not an afterthought.

### Tasks
- [x] 3.1 Parity test matrix
  - same request through TS-visible path and Rust execution path
  - compare status / output / errors / cancel / timeout / audit metadata

- [x] 3.2 Audit and error normalization
  - make denial / timeout / cancellation / runtime error shapes stable
  - keep user-facing explanations in TS, execution facts in Rust

- [x] 3.3 Contract-driven evolution
  - every new execution-plane feature must land behind a contract update + tests

### Acceptance Criteria
- contract is the source of truth for crossing TS ↔ Rust
- parity failures are visible via automated tests
- no silent semantic drift between TS expectations and Rust behavior

---

## What Not To Prioritize Now

- more slash-command surface area for its own sake
- broader MCP surface area without execution semantics
- complex TUI/UI polish
- Python online-path expansion
- Rust ownership of shell/session/orchestration

---

## Immediate Next Step

Start with:

### Phase A
**TS control plane stabilization — transcript durability / replay hardening**

Reason:
- TS is already the practical control-plane host
- cleaner replay/recovery semantics make Rust integration safer
- this reduces the chance that Rust adoption papers over TS state ambiguity

### Then Phase B
**Rust execution plane mainline — daemon-first execution routing**

Reason:
- Rust is now mature enough to stop being a side path
- execution concerns can move without stealing control-plane responsibilities

---

## Success Condition For This Phase

At the end of this phase, the system should have a clear statement that is true in code:

> TS decides, routes, presents, and recovers.
> Rust executes, isolates, times out, cancels, and reports.
