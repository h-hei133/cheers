# PROJECT_STATE.md

## 1. Current Stage Positioning

- Project name: private-coding-agents
- Current stage mainline: **active product hardening** on default CLI path
- Stage objective: make the interactive shell feel production-grade while preserving load-bearing runtime semantics
- Current focus: transport-unified turn execution + answer-first terminal rendering contract

What this stage is **not**:

- not a broad platform rewrite
- not a provider expansion campaign
- not a long-term memory project

## 2. Repository and Reference Boundaries

- Read-only reference repo:
  - `D:\LenovoSoftstore\pyproject\source-claudecode`
- Writable working repo:
  - `D:\LenovoSoftstore\pyproject\source-claudecode\private-coding-agents`
- Secondary reference for UX/provider patterns:
  - `D:\LenovoSoftstore\pyproject\opencode`

Boundary rules:

- recover load-bearing runtime truth from Claude Code snapshot when needed
- absorb practical CLI/product behavior from opencode where it improves real usage
- only modify and validate code in the private repo
- keep TS/Rust/contracts boundaries intact

## 3. Architectural Position (unchanged)

### TypeScript = control plane

Includes:

- shell / interactive CLI
- session lifecycle and continuity
- orchestration and query loop semantics
- slash routing / shell actions
- recovery and permission UX
- MCP capability routing
- terminal rendering contract and output boundary

### Rust = execution plane

Includes:

- daemon execution backend
- command execution / timeout / cancel
- sandbox preflight
- execution responsibility only

### contracts = cross-runtime semantic boundary

- protocol, lifecycle, and payload compatibility across runtimes

## 4. Current Product Mainline

The primary user-visible mainline is now:

1. User submits prompt in default CLI
2. Prompt resolves through shared turn execution backbone
3. Query loop runs with continuity and permission semantics
4. User sees answer-first terminal output
5. Result block stays minimal and actionable in compact mode
6. Session remains ready for next turn with clear boundaries

## 5. Latest Implemented Delta (2026-04-19)

### A. Transport-unified turn execution (already landed)

- shared turn resolver/executor paths across interactive, `--print`, stdin, and replay
- stdin moved to stream-first reading + sequential prompt batch execution
- interactive in-flight gating to reduce overlapping-turn submission issues

### B. Answer-first terminal rendering contract (landed)

- compact mode suppresses planner-phase leakage (for example `Plan accepted...`)
- compact mode renders minimal terminal outcome + minimal coding contract
- verbose mode keeps full lifecycle/result diagnostics for developer view
- minimal result classification now considers task satisfaction evidence to avoid misleading “completed=success” messaging in blocked flows

### C. Live turn boundary UX (landed in interactive path)

- interactive turn boundary markers:
  - `=== Turn N ===`
  - `=== End Turn N ===`

## 6. Confirmed Baseline Facts

- unified query loop exists and is durable
- replay/recovery substrate exists
- lifecycle compensation exists
- terminal envelope semantics exist (`terminalReason` + classification)
- provider readiness gate exists before real-provider execution
- compact vs verbose user output layering exists
- `/connect` is the provider onboarding command family (not `/auth`)

## 7. Current Primary Gaps

1. true live TTY automation evidence remains weaker than print/stdin/replay evidence in this environment
2. execution success still depends on model/tool behavior; output contract improvements do not guarantee every edit request is actually executed
3. some legacy docs and examples still reflect previous phase assumptions and need gradual cleanup

## 8. Re-entry / Escalation Triggers

Escalate from hardening into focused implementation when one is reproducible:

1. real live-CLI task shows answer/result boundary regression (answer missing, noisy leakage, or false completion)
2. transport parity drift appears between interactive and non-interactive paths
3. continuity breaks in active session for core coding workflow (read/edit/verify follow-up)

## 9. Current Minimal Next Step

- keep hardening the default interactive experience and output truthfulness
- prefer medium-impact user-visible improvements over low-value micro-patches
- avoid unrelated provider/auth expansion during this stage unless it blocks mainline usability

## 10. Update Rules

Update this file when one of these changes materially:

- stage objective or stage mode
- product mainline contract
- baseline facts or primary gaps
- escalation triggers

Do not turn this file into:

- run-by-run transcript dump
- roadmap backlog
- provider marketing sheet
