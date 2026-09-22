---
title: "Cheers Knowledge Base"
description: "Project knowledge base for the three-layer autonomous coding agent framework: TypeScript control plane, Rust native executor candidate, and Python eval harness."
created: 2026-08-28
freshness_threshold: 70
---

# Wiki Configuration

## Scope

This wiki covers the architecture, core execution paths, proof and evidence contracts, benchmark integration, and reference implementations for the `cheers` project.

- **TypeScript Control Plane**: CLI, QueryEngine, TaskLoop, Session & Replay, Patch & Repair, Verification & Proof.
- **Native Executor**: Rust core daemon, OS/sandbox isolation, process lifecycle.
- **Offline Evaluation**: Python evaluation harness, SWE-bench and autonomous benchmark suites.
- **Reference Architectures**: Lessons and comparative analyses from `pi`, `opencode`, `GitNexus`, `stagehand`, `mem0`, `graphiti`, `inspect_ai`, `mini-swe-agent`.

## Conventions

- Dual-linking: `[[slug|Name]] ([Name](../category/slug.md))`
- Raw sources are immutable under `raw/`.
- Articles in `wiki/` must cite evidence from `raw/` sources.
- Structured frontmatter on all articles (`title`, `category`, `sources`, `created`, `updated`, `tags`, `summary`, `confidence`).
