---
title: "Coding Agents Architecture and Sprint Overview"
source: "AGENTS.md, docs/ACTIVE_CONTEXT.md, and docs/DOC_STATUS.md"
type: notes
ingested: 2026-08-28
tags: [architecture, ts-shell, rust-core, python-eval, normproof]
summary: "Foundational notes on the three-layer autonomous coding agent framework, ownership boundaries, and structural norms."
---

# Coding Agents Architecture and Sprint Overview

## Architectural Layers

1. **TypeScript Product Runtime and Control Plane (`packages/ts-shell`)**:
   - Shell, interactive CLI, session management, QueryEngine, task loop.
   - Capability routing, patch generation, reviewed workspace apply, verification receipts, task proof.
2. **Native Execution Layer (`packages/rust-core`)**:
   - Daemon candidate for OS/process lifecycle, sandbox preflight, timeouts, and process tree management.
3. **Offline Evaluation Layer (`packages/python-eval`)**:
   - Offline benchmarks, traces, SWE-bench and autonomous capability evaluation suites.

## Quality & Architectural Governance

- Non-negotiable evidence and truthfulness invariants: no false complete claims, must possess physical verification receipts before issuing task proof.
- NormProof architectural watch:
  - `source_graph_has_no_unresolved_specifiers` (blocking): zero broken imports across packages.
  - `source_graph_is_acyclic` (advisory): no cyclic module dependencies.
  - `declared_functions_within_module_ceiling` (advisory): module responsibility ceiling ($\le 20$ functions).
