---
title: "Cheers Topic Guide"
schema_state: advisory
created: 2026-08-28
updated: 2026-08-28
summary: "Human-owned topic guide for cheers vocabulary, domain boundaries, and reference mappings."
---

# Cheers Topic Guide

> This is an advisory topic guide for local vocabulary, domain boundaries, and conceptual relationships.

## State

- `schema_state`: `advisory`

## Entity Types

| Type | Meaning |
|------|---------|
| `concept` | Core autonomous agent mechanisms (e.g. QueryEngine, TaskProof, ReviewedApply, ReActLoop). |
| `topic` | High-level subsystem or workflow areas (e.g. control-plane, execution-seam, evidence-grounding). |
| `reference` | Component specifications, API contracts, and comparative reference analyses (e.g. Pi comparison, GitNexus graph). |

## Relationship Verbs

- `cites`: Article cites source documentation or code facts.
- `depends-on`: Subsystem requires specific contract or executor.
- `implements`: Concrete implementation of an architectural obligation or seam.
- `verifies`: Verification route validating a runtime claim.
- `replaces`: Refactored module superseding legacy route implementation.

## Source Conventions

- Code facts must be grounded in `packages/ts-shell`, `packages/rust-core`, or reference repositories under `~/projects/`.
- No unsubstantiated success claims; follow strict evidence and truthfulness invariants.
