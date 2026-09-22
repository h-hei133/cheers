---
title: "NormProof Structural Governance"
category: topic
sources: [raw/notes/2026-08-28-architecture-and-sprint-overview.md]
created: 2026-08-28
updated: 2026-08-28
tags: [normproof, architecture-governance, dependency-graph, responsibility-ceiling]
summary: "Overview of NormProof architectural verification, formal obligations, and disposition workflow."
confidence: high
---

# NormProof Structural Governance

NormProof is the formal architecture watch mechanism for this repository. It evaluates the codebase against structural invariants and prevents architectural debt accumulation.

## Core Norms

| Obligation ID | Severity | Purpose | Current Status |
| :--- | :--- | :--- | :--- |
| `source_graph_has_no_unresolved_specifiers` | **Blocking** | Ensures all module imports resolve within the declared graph. | **SATISFIED** (0 gaps) |
| `source_graph_is_acyclic` | Advisory | Guarantees zero circular dependencies across source files. | **SATISFIED** (0 cycles) |
| `declared_functions_within_module_ceiling` | Advisory | Enforces single-responsibility ceiling ($\le 20$ declared function names per file). | Monitored with `.normproof/dispositions.md` |

## Execution & Verification

Run the judge locally:

```bash
npx --package .normproof/normproof-0.1.0.tgz normproof judge
```

Findings decided to be deferred are formally recorded in `.normproof/dispositions.md` per protocol.

## See Also

- [[three-layer-agent-architecture|Three-Layer Agent Architecture]] ([Three-Layer Agent Architecture](../concepts/three-layer-agent-architecture.md))
- [[evidence-and-proof-system|Evidence & Proof System]] ([Evidence & Proof System](../concepts/evidence-and-proof-system.md))

## Sources

- [Coding Agents Architecture and Sprint Overview](../../raw/notes/2026-08-28-architecture-and-sprint-overview.md) — NormProof rules and obligations
