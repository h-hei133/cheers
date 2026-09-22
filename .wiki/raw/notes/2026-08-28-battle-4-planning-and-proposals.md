# Deep Dive: Planning Runtime, Proposal Calibration & Contract Retry

## Overview
In Special Battle 4 of Phase 3, we modernize the planning runtime subsystem:
1. Decomposing `planning/runtime/engine.ts` (27 functions) into modular classifiers, target selectors, and handoff builders.
2. Decomposing `planning/runtime/proposal.ts` (28 functions) into prompt context builders, attempt runners, and contract retry handlers.
3. Ingesting mini-swe-agent's step-progression and failure-handling model.

## Architectural Deliverables

| Target Subsystem | Original File | Decomposed Sub-modules | Purpose & Capability |
| :--- | :--- | :--- | :--- |
| **Planning Engine** | `planning/runtime/engine.ts` (27 fn) | `planning/runtime/types.ts`<br/>`planning/runtime/classifier.ts`<br/>`planning/runtime/handoff.ts`<br/>`planning/runtime/engine.ts` | Task kind classification, target ranking selection, verification intent summarization. |
| **Proposal & Retry** | `planning/runtime/proposal.ts` (28 fn) | `proposal/context.ts`<br/>`proposal/attempt.ts`<br/>`planning/runtime/proposal.ts` | Bounded workspace context, dry-run preflight classification, and contract retry loops. |
