# Deep Dive: Terminal Surface and Streaming Componentization

## Overview
In Special Battle 3 of Phase 3, we modernize the presentation surface subsystem:
1. Decomposing `presentation/surface/model.ts` (51 functions) into modular section builders, status classifiers, and layout projectors.
2. Ingesting Pi's terminal component primitives (`packages/tui/src/components`).

## Architectural Deliverables

| Target Subsystem | Original File | Decomposed Sub-modules | Modernization Value |
| :--- | :--- | :--- | :--- |
| **Surface Modeling** | `presentation/surface/model.ts` (51 fn) | `surface/sections/types.ts`<br/>`surface/sections/events.ts`<br/>`surface/sections/status.ts`<br/>`surface/sections/layout.ts`<br/>`surface/model.ts` (Facade) | Modular section builders, clear event taxonomy, view model projection. |
| **Terminal Components** | N/A | `presentation/components/statusBadge.ts`<br/>`presentation/components/box.ts` | Reusable ANSI status badges and frame layouts. |
