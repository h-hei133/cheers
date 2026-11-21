---
title: "NormProof Structural Governance"
category: topic
sources: [raw/notes/2026-08-28-architecture-and-sprint-overview.md]
created: 2026-08-28
updated: 2026-11-21
tags: [normproof, architecture-governance, dependency-graph, responsibility-ceiling]
summary: "Overview of NormProof architectural verification, formal obligations, active hooks, and disposition workflow."
confidence: high
---

# NormProof Structural Governance

NormProof is the formal structural governance layer for this repository. It enforces architectural invariants across all nine workspace packages through both active hooks (`.agents/hooks.json`: PreToolUse `write-gate` and Stop `completion-gate`) and terminal judgement (`normproof judge`).

## Core Obligations (`.normproof/norm-packs/software-structure-v0/profile.json`)

| Obligation ID | Severity | Purpose |
| :--- | :--- | :--- |
| `source_graph_has_no_unresolved_specifiers` | **Blocking** | Ensures all relative and workspace package imports resolve within the declared graph with valid exports and no cross-package relative escapes. |
| `source_graph_is_acyclic` | **Blocking** | Guarantees zero runtime value dependency cycles (`type-only` edges are excluded from cycle checks). |
| `domains_do_not_reach_shell` | **Blocking** | Ensures no extracted domain package under `packages/**` (excluding `packages/ts-shell/**`) directly or transitively reaches `packages/ts-shell/**`. |
| `execution_does_not_reach_cli` | Advisory (`judge`) / **Blocking** on new paths (`write-gate`) | Prevents `packages/ts-shell/src/runtime/execution/**` from depending on `packages/ts-shell/src/cli/**`. |
| `declared_functions_within_module_ceiling` | Advisory (`judge`) / **Blocking** above ceiling (`write-gate`) | Enforces the v2 baseline seed floor (20 function-like names or legacy accepted ceiling in `.normproof/baseline.json`) across production modules (`**/*.test.ts*` and `**/*.spec.ts*` excluded). |

## Execution & Verification

Run the pinned judge locally (supported on Node `>=20.3.0`):

```bash
npx --package .normproof/normproof-0.1.0.tgz normproof judge
```

Advisory findings decided to be deferred are recorded in `.normproof/dispositions.md` (append-only).

## See Also

- [[evidence-and-proof-system|Evidence and Proof System]] ([Evidence and Proof System](../concepts/evidence-and-proof-system.md))
- [AGENTS.md](../../../AGENTS.md)

## Sources

- [Coding Agents Architecture and Sprint Overview](../../raw/notes/2026-08-28-architecture-and-sprint-overview.md) — Initial governance baseline
- `.normproof/norm-packs/software-structure-v0/profile.json` and `.normproof/write-rules.json` — Current active obligations and write-gate rules
