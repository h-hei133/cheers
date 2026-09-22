---
title: "Local Reference Repositories"
category: reference
sources: [raw/notes/2026-08-28-reference-projects-matrix.md]
created: 2026-08-28
updated: 2026-08-28
tags: [references, pi, opencode, gitnexus, stagehand, mem0, graphiti, inspect_ai, mini-swe-agent]
summary: "Comparative architecture reference matrix mapping local projects in ~/projects/ to candidate subsystems in coding-agents."
confidence: high
---

# Local Reference Repositories

A targeted matrix of available local reference repositories under `~/projects/` and what can be learned or reused from each:

| Repository | Core Strengths | Reuse / Learning Target for `coding-agents` |
| :--- | :--- | :--- |
| **`pi` & `pi-docs-playbook`** | Minimal, extensible Agent Loop; state-as-files. | Event-driven loop simplification and session branching. |
| **`opencode`** | Modular model adapters & streaming protocols. | Multi-provider request normalization and streaming token flow. |
| **`GitNexus`** | Code knowledge graph & symbol call graph indexing. | Context discovery engine and precise modification scope extraction. |
| **`mini-swe-agent`** | Lean SWE-bench execution loop and rapid exit verification. | Targeted debug and repair loop optimizations. |
| **`stagehand`** | Playwright browser observation & intent execution. | Standardized browser tooling and DOM snapshot extraction. |
| **`mem0` / `graphiti`** | Tiered and graph-based memory models. | Working memory vs episodic session context compaction. |
| **`inspect_ai`** | Deterministic AI evaluation harness. | Offline eval protocol hardening for `packages/python-eval`. |

## Usage Boundaries

Per repository rules (`AGENTS.md`):
- Reference repositories are strictly read-only.
- Inspect the target implementation first before referencing.
- Do not mechanically copy code wholesale; adopt architectural patterns and contracts.

## See Also

- [[three-layer-agent-architecture|Three-Layer Agent Architecture]] ([Three-Layer Agent Architecture](../concepts/three-layer-agent-architecture.md))

## Sources

- [Local Reference Repositories Analysis](../../raw/notes/2026-08-28-reference-projects-matrix.md) — Reference project analysis
