---
title: "Evidence and Proof System"
category: concept
sources: [raw/notes/2026-08-28-architecture-and-sprint-overview.md]
created: 2026-08-28
updated: 2026-08-28
tags: [evidence, task-proof, truthfulness, verification-receipts]
summary: "The formal evidence, truthfulness, and verification receipt pipeline that prevents false-positive task completion claims."
confidence: high
---

# Evidence and Proof System

The Evidence and Proof System enforces that no task completion is claimed without deterministic, physical verification receipts.

## Key Principles

1. **Receipts Precede Proof**:
   - Changes to files must be validated by real test runs or compiler execution.
   - Outputs without receipts are classified as `not-proven`.
2. **Anti-False-Success Gate**:
   - Rejects claims of success where no verification was executed for touched files.
3. **Immutability of Ledger**:
   - Evidence records (`ProductEvidenceRow`) capture provenance, level, redaction status, and cleanup integrity.

## Relationship to Architecture

The proof system works directly with the [[three-layer-agent-architecture|Three-Layer Agent Architecture]] ([Three-Layer Agent Architecture](../concepts/three-layer-agent-architecture.md)) to audit operations across the execution seam.

## See Also

- [[three-layer-agent-architecture|Three-Layer Agent Architecture]] ([Three-Layer Agent Architecture](../concepts/three-layer-agent-architecture.md))
- [[normproof-structural-governance|NormProof Structural Governance]] ([NormProof Structural Governance](../topics/normproof-structural-governance.md))

## Sources

- [Coding Agents Architecture and Sprint Overview](../../raw/notes/2026-08-28-architecture-and-sprint-overview.md) — Non-negotiable evidence rules
