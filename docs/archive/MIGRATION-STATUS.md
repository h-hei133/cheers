# Migration Status Report

**Project:** private-coding-agents  
**Date:** 2026-04-19  
**Status:** active hardening on default CLI product path

## Executive Summary

The project has moved from “foundation/migration closure” into **product-facing runtime hardening**. The architecture remains stable (TS control plane, Rust execution plane, contracts semantic boundary), while current work emphasizes interactive shell quality, transport parity, and truthful terminal outcomes.

## Current Architectural Position

### TypeScript is the control plane

TypeScript remains responsible for:

- interactive shell runtime
- query loop/orchestration lifecycle
- session continuity/recovery
- slash + shell actions
- permission UX and MCP routing
- terminal output contract (compact user view vs verbose developer view)

### Rust is the execution plane

Rust remains responsible for:

- daemon-backed execution
- timeout/cancel
- sandbox preflight

Rust is intentionally not taking over shell/session/orchestration semantics.

### contracts remain the semantic backbone

Contracts continue to define runtime boundary and payload compatibility across TS/Rust/Python surfaces.

## Latest Migration Delta (2026-04-19)

### 1) Transport-unified turn execution hardening

Implemented and validated in `packages/ts-shell/src/entrypoints/cli.tsx`:

- shared turn execution path across interactive, `--print`, stdin, replay
- stdin stream-first ingestion + sequential prompt batch execution
- interactive turn in-flight gating to reduce overlapping submissions

### 2) Answer-first terminal rendering contract

Implemented and validated in `packages/ts-shell/src/core/shell/sessionRuntime.ts`:

- compact mode suppresses planner-phase leakage into user answer stream
- compact mode now emits minimal, actionable result contract:
  - `Result: ...`
  - `Task: ... | Changed: ... | Verify: ...`
  - optional `Next:` / `Notes:`
- verbose mode retains developer diagnostics and full contract detail

### 3) Interactive turn boundary UX

Implemented in interactive execution path:

- `=== Turn N ===`
- `=== End Turn N ===`

This improves readability and boundary clarity for live multi-turn sessions.

## Verified Runtime State (This Checkpoint)

- `npm run build -w packages/ts-shell` ✅
- real-entry checks executed on:
  - `--print`
  - stdin non-interactive
  - `--replay-file`
- observed outcomes:
  - answer appears before minimal result block
  - compact output no longer leaks planner-phase line by default
  - blocked/denied command case no longer shows misleading minimal success wording; now reflects insufficient evidence in compact outcome

## Known Limits (Current)

- true interactive TTY automation remains environment-limited; local manual interactive validation is still required for final confidence
- output contract improvements do not guarantee tool/model execution success for every edit task
- historical docs still contain old phase language and are being corrected incrementally

## Immediate Next Focus

1. continue hardening default interactive shell UX and output truthfulness
2. keep transport parity stable as new features land
3. avoid unrelated expansion (provider/auth/platform-wide refactor) unless it blocks mainline usability

## Bottom Line

The migration is no longer blocked by architecture construction. The current leverage point is **product-grade terminal behavior** on the default CLI path: answer-first, low-noise, truthful outcomes, and stable multi-turn boundaries.
