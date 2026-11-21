---
title: "Cheers Knowledge Base"
description: "Project knowledge base for the TypeScript monorepo autonomous coding agent: shell control plane, independent domain packages, OS sandbox isolation, and NormProof structural governance."
created: 2026-08-28
updated: 2026-11-21
freshness_threshold: 70
---

# Wiki Configuration

## Scope

This wiki covers the architecture, core execution paths, proof and evidence contracts, structural governance, and reference analyses for the `cheers` project.

- **TypeScript Control Plane (`packages/ts-shell`)**: CLI, QueryEngine, TaskLoop, Session & Replay, Patch & Repair, Verification & Proof, OS sandbox (`bwrap` / `sandbox-exec`).
- **Independent Domain Packages (`packages/*`)**: `advisor`, `browser`, `collaboration`, `desktop`, `media`, `planning`, `research`, `workflow`.
- **Structural Governance (`.normproof/`)**: NormProof pinned judge, PreToolUse write-gate, and Stop completion-gate.
- **Reference Architectures**: Comparative analyses from `pi`, `oh-my-pi`, `codex`, `opencode`, `deepseek-harness`, `GitNexus`, `stagehand`, `mem0`, `graphiti`, `inspect_ai`, `mini-swe-agent`.

## Conventions

- Dual-linking: `[[slug|Name]] ([Name](../category/slug.md))`
- Raw sources are immutable under `raw/`.
- Articles in `wiki/` must cite evidence from `raw/` sources or current repository code.
- Structured frontmatter on all articles (`title`, `category`, `sources`, `created`, `updated`, `tags`, `summary`, `confidence`).
