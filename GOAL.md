# Goal: Clean Architecture, Decouple Cycles & Enforce NormProof Constraints

## Context & Background
The project `coding-agents` is a multi-tier autonomous coding agent framework (`packages/ts-shell`, `packages/rust-core`, `packages/python-eval`).
In accordance with `AGENTS.md`, `agent-rules/`, and `.normproof` architectural norms, this round focuses on establishing clean structural boundaries, eliminating dead imports / unresolved specifiers, resolving circular dependencies, adhering to single-responsibility ceilings, and securing repeatable verification.

## Primary Objectives

### 1. Fix All Unresolved Specifiers (Blocking Architectural Gaps)
Eliminate all 7 broken/dead import paths identified by NormProof:
- `packages/ts-shell/src/core/query/lightweightChat.ts`
- `packages/ts-shell/src/model-adapters/types.ts`
- `packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.ts`
- `packages/ts-shell/src/turn/roleDraftStage.ts`
- `packages/ts-shell/src/runtime/execution/service.test.ts`
- `packages/ts-shell/src/edit/patch/status/readiness.test.ts`
- `packages/ts-shell/src/daemon/client.test.ts`

Rule adherence: Ensure imports end with `.js` for local TS files, remove references to non-existent root `contracts/typescript/types.js`, and align with domain-owned contracts under `packages/ts-shell/src/`.

### 2. Break Dependency Cycles (Acyclic Graph Obligation)
- Break the circular import between `packages/ts-shell/src/core/context/browserTxnEvidence.ts` and `packages/ts-shell/src/core/context/browserTrace.ts` by extracting shared evidence/trace types or event contracts into an independent leaf module.

### 3. Progressive Responsibility Ceiling Refactoring (Module Size <= 20 Functions)
- Audit modules exceeding the 20 declared function/method ceiling.
- Progressively decompose oversized files into domain-owned sub-modules (`model`, `projection`, `policy`, `adapter`) rather than bloated monolithic files.
- For modules deliberately deferred, record formal entries in `.normproof/dispositions.md` per the NormProof Disposition Protocol.

### 4. Verification & Grounding
- Run TypeScript build check (`npm run build:ts`) to guarantee zero compilation or import regressions.
- Run focused domain tests for affected modules (`vitest run <affected-tests>`).
- Execute `normproof judge` (`npx --package .normproof/normproof-0.1.0.tgz normproof judge`) and verify that:
  - `source_graph_has_no_unresolved_specifiers` PASSES (0 blocking gaps).
  - `source_graph_is_acyclic` PASSES (0 dependency cycles).
- Record truthfulness evidence and update documentation cleanly without fabricating results.
