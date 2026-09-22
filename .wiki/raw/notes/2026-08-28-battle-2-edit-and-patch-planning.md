# Deep Dive: Multi-File Mutation Graph and Per-File Patch Planning

## Overview
In Special Battle 2 of Phase 3, we modernize the code mutation pipeline by decomposing:
1. `edit/multifile/model.ts` (39 functions) -> `multifile/{types, conflict, graph, model}.ts`
2. `edit/patch/plan/perFile.ts` (38 functions) -> `patch/plan/{types, operation, validator, perFile}.ts`
3. Ingesting Pi's fuzzy diff normalization pattern (`edit-diff.ts`).

## Architectural Deliverables

| Target Subsystem | Original File (Over Limit) | Decomposed Sub-modules | Purpose & Capability |
| :--- | :--- | :--- | :--- |
| **Multi-File Mutation** | `edit/multifile/model.ts` (39 fn) | `multifile/types.ts`<br/>`multifile/conflict.ts`<br/>`multifile/graph.ts`<br/>`multifile/model.ts` | Multi-target dependency graphs, conflict detection, rollback & settlement observation. |
| **Per-File Patch Planning** | `edit/patch/plan/perFile.ts` (38 fn) | `patch/plan/types.ts`<br/>`patch/plan/operation.ts`<br/>`patch/plan/validator.ts`<br/>`patch/plan/perFile.ts` | Operation validation (Add, Move, Update, Delete), broad patch safety checks, failure classes. |
| **Diff Normalization** | N/A | `edit/patch/normalization/diffNormalize.ts` | Unicode/quote normalization and line-ending preservation. |
