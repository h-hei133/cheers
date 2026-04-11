# Phase 2 Productization Plan

## Goal

Turn the Phase 1 technical foundation into a version that is practical for daily personal use.

## Ordered Workstreams

- [x] 1. Installation and startup experience
  - Add environment self-check command and startup diagnostics
  - Add one-command bootstrap/setup flow
  - Improve missing dependency/toolchain guidance
  - Add daily-use startup documentation

- [x] 2. Daily-use safety UX
  - Make escalation prompts more readable/actionable
  - Improve audit visibility and denial explanations
  - Add clearer dangerous-operation confirmation language

- [x] 3. Stability and recovery
  - Improve crash/restart recovery messaging
  - Harden daemon fallback behavior
  - Add recovery-focused operational checks

- [x] 4. Configuration and maintainability
  - Introduce explicit local config surface
  - Centralize feature flags/provider settings
  - Document upgrade/compatibility expectations

## Phase 2.1 Immediate Deliverable

Deliver a self-check/bootstrap/startup layer so a daily user can quickly tell:
- what is installed,
- what is missing,
- how to fix it,
- and which execution path is active.
