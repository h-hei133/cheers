# Architectural Decisions - Private Coding Agents Rewrite

> Major design choices and their rationale.

---

## [2026-04-07] Core Architecture

**Decision**: Three-layer architecture (TS shell + Rust core + Python eval)

**Rationale**:
- TypeScript: agent orchestration, CLI/TUI, MCP client/gateway, tool registry
- Rust: high-performance execution kernel, sandboxing, file system watching, diff/patch engines
- Python: research and evaluation layer only (not in critical path)

**Constraints**:
- MVP priority: CLI-first
- Deployment: single-machine local-first
- Security: strict sandbox default + explicit escalation
- Model strategy: pluggable provider adapter, OpenAI-first
- Platform: Windows-first
- Team: solo maintainer, long-term maintainability focus
- Rust daemon: Phase-2 (not MVP blocker)

---

## [2026-04-07] T4 Model Adapter Abstraction

**Decision**: Introduce a provider-neutral adapter contract in `packages/ts-shell/src/model-adapters` and isolate OpenAI-specific transport + payload handling under `providers/openai`.

**Rationale**:
- Keeps orchestration path provider-agnostic (`ModelProviderAdapter`, `createModelClient`) so provider swap is configuration-only.
- Avoids leaking OpenAI wire payloads into request loop logic by normalizing into `NormalizedStreamEvent` and `NormalizedProviderError`.
- Encodes provider capabilities (`supportsStreaming`, `supportsToolCalls`, `supportsJsonResponseFormat`) as metadata for future negotiation/fallback logic.
- Matches existing retry/error style by classifying errors into retriable/non-retriable categories with optional retry-after metadata.

---
