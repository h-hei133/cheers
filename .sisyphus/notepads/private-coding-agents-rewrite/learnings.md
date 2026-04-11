# Learnings - Private Coding Agents Rewrite

> Accumulated conventions, patterns, and best practices discovered during implementation.

---

## [2026-04-07] T12 Observability Baseline (Trace IDs, Structured Logs, Secret Redaction)

**What worked**:
- Lazy global trace context initialization (`getGlobalTraceContext()` creates on first access) avoids explicit threading and simplifies component integration.
- Per-component loggers (`createComponentLogger(componentName)`) capture source identity without manual parameter passing.
- Structured log entries as JSON-serializable objects (with timestamp, level, traceId, spanId, fields) enable deterministic testing and machine-parseable output.
- Secret redaction as a transformation layer (applied in `formatEntry()`) ensures no raw secrets leak regardless of how the message is constructed.
- Global log sink attachment pattern allows tests to capture logs without modifying component code.

**Conventions captured**:
- Trace ID format: `trace_${uuid}` for human readability and grep-ability in logs.
- Span ID format: `span_${uuid}` with optional `parentSpanId` field for multi-level call chains.
- Secret redaction patterns handle OpenAI keys (sk_*, pk_*), JWTs, Bearer tokens, URLs with credentials, AWS keys, Google API keys.
- Sensitive field names (secret, api_key, token, password) are redacted to `[REDACTED]` regardless of actual value, preventing accidental leaks.
- Structured logging includes timestamp (ISO 8601), level (debug/info/warn/error), component name, and arbitrary fields.
- Log sink is called *after* redaction to ensure sink implementations never see raw secrets.

**Integration points for future tasks**:
- T13 Rust daemon can propagate trace ID in daemon protocol messages (X-Trace-ID header or envelope field).
- T15 feature flag routing can log which path (TS vs Rust) executes and include both in same trace.
- T16 performance monitoring can emit metrics with same trace ID for correlation.

**Windows-first considerations**:
- `randomUUID()` (from Node.js crypto module) works cross-platform and needs no Windows-specific handling.
- ISO 8601 timestamps (from `new Date().toISOString()`) are deterministic and timezone-agnostic, good for testing.
- Regex patterns for secret detection are platform-independent; test with both forward and backslash path separators if needed.

---

## [2026-04-07] T11 Provider Hardening + T12 TS-Shell Observability

**What worked**:
- Injecting adapter and sleep dependencies into the model client made retry/fallback behavior deterministic to test without fake-timer fragility.
- Provider health should track failed requests, not individual retry attempts, otherwise degraded mode trips too early inside one request.
- Observability is most reliable when attached to the actual TS-shell execution path instead of a parallel root-level utility tree.

**Conventions captured**:
- Keep fallback policy generic around normalized provider errors so retry/degrade logic stays provider-agnostic.
- Attach structured logging at CLI, orchestration, tool-dispatch, and provider boundaries, then assert one shared trace ID in an integration test.
- Redact secrets before emitting to sinks so no downstream sink ever sees raw sensitive values.

---

## [2026-04-07] T13/T14/T15 Rust Execution Path Foundations

**What worked**:
- A narrow Rust daemon contract that returns structured JSON is enough to prove timeout/cancel policy before doing a full protocol migration.
- Rust-side sandboxing is easiest to stage as a preflight evaluation step that returns `escalation required` before execution, then let the TS bridge decide whether to proceed.
- Feature-flagging the Rust path at the tool registry boundary keeps the fallback path simple and makes parity testing practical.

**Conventions captured**:
- Keep the Rust daemon binary deterministic: one command in, one JSON result out.
- Track execution-path metadata (`ts-local` vs `rust-daemon`) in the TS layer so migration behavior stays observable.
- Use workspace-root + cwd together on the Rust side to mirror TS default-deny policy without hard-coding repo paths.

---

## [2026-04-07] T16 Reliability Hardening

**What worked**:
- A small backpressure controller at the tool-dispatch boundary is enough to prevent unbounded in-flight work without restructuring the orchestration loop.
- Release readiness is clearer when rollback, known limitations, and verification commands live in explicit top-level docs.

**Conventions captured**:
- Keep overload behavior explicit and testable with a dedicated runtime utility instead of implicit queue growth.
- Document the feature-flag rollback path (`DAEMON_ENABLED=0`) alongside release verification steps.

---

## [2026-04-08] W1 QueryEngine / query Migration

**What worked**:
- The safest first migration step was to extract the turn loop into a new `core/query` runtime while keeping `MultiAgentOrchestrator` as a compatibility wrapper.
- Separating `runtimeState`, `transitions`, and `resultMapper` made stop reasons explicit and testable without dragging the CLI into the core loop.

**Conventions captured**:
- New ClaudeCode core migrations should land behind compatibility wrappers first, then replace older entrypoints once the core tests are stable.
- W1 proved that a source-to-target responsibility map is a practical gate before implementation, not just planning overhead.

---

## [2026-04-08] W2 Tool Runtime / Permission Migration

**What worked**:
- The safest W2 move was to keep `src/tools/dispatcher.ts` as a compatibility facade while moving the real split into `src/core/tools/`.
- Separating permission check construction from approval enforcement from runtime execution made the ClaudeCode-inspired layering visible without breaking existing tests.

**Conventions captured**:
- Future core migrations should preserve old entrypoints as thin wrappers until the new core layer has dedicated tests and integration proof.
- When refactoring runtime layers, expect observability and compatibility tests to need name-level updates (for example `tool-dispatch` to `tool-runtime`) even when behavior is unchanged.

---

## [2026-04-09] A2 Durability / Replay Phase 1

**What worked**:
- Upgrading `transcript.jsonl` from message-only storage to mixed transcript events was a low-risk way to strengthen runtime semantics without breaking the current session API.
- Recovery becomes much easier once session code can ask for a structured recovery snapshot instead of re-deriving state from final turns alone.

**Conventions captured**:
- Persist runtime-significant events at the session substrate boundary, not only in renderer-facing code.
- Keep transcript append and state snapshot separate: transcript for replay/history, state for the latest recovery pointer.

---

## [2026-04-09] B4/B5 Rust Execution Mainline + Parity

**What worked**:
- Promoting daemon-first routing was safe once TS local execution normalized into the same result shape as the Rust daemon.
- Parity tests are most valuable when they compare the same command across both paths for success and timeout, not just happy-path output.

**Conventions captured**:
- Keep Rust as the preferred execution path, but make fallback explicit in metadata and tests.
- Treat parity as a testable contract, not an architectural claim.

---

## [2026-04-09] C4/C5 Shell Actions + Command Registry Semantics

**What worked**:
- Expanding shell actions around actual runtime operations (`resume`, `cancel`, `sessions`, `mcp`, `help`) gave registry semantics meaning without command sprawl.
- Adding `availability`, `enabled`, and `bridgeSafe` was enough to turn the registry from a flat list into a policy-bearing layer.

**Conventions captured**:
- Hide commands through registry semantics first, then let slash routing enforce that visibility.
- Keep shell actions typed and runtime-facing; avoid collapsing them back into prompt text.

---

## [2026-04-09] D4/D5 Shell Substrate Atomicity

**What worked**:
- Atomic session switching belongs in runtime context, not in ad hoc entrypoint assignments.
- Moving resume/close paths into `core/shell` lowered the chance of session identity drift.

**Conventions captured**:
- `cwd`, `originalCwd`, `projectRoot`, and active session identity should move together as substrate state.
- Entry points should delegate recovery and close semantics instead of deciding them directly.

---

## [2026-04-09] E4 Visible Tool Pool Coverage

**What worked**:
- Combination testing for visible tool pool rules is necessary; single-rule tests are not enough once MCP and hidden prefixes coexist.

**Conventions captured**:
- Treat visible capability pool as its own behavior surface with dedicated tests.

---

## [2026-04-09] A3-A5 Durability / Replay Closure

**What worked**:
- Separating the durable prompt barrier from the later query-turn transition clarified the difference between interrupted prompt and interrupted turn.
- Replay becomes much more useful once the substrate can normalize transcript events and generate a continuation plan instead of only returning raw history.

**Conventions captured**:
- Treat prompt durability as a first-class barrier, not just another state mutation.
- Recovery helpers should work from transcript + state snapshot together, not from turns alone.

---

## [2026-04-07] T10 MVP End-to-End Integration

**What worked**:
- Integrating orchestration, sandbox enforcement, tool dispatcher, and streaming adapter in one focused runtime harness made cross-task contracts explicit and testable.
- Reusing the existing `ToolDispatcher + SandboxEnforcer` path in orchestration-level acceptance tests catches policy regressions that unit-only tests can miss.
- Streaming role drafts through the existing OpenAI normalization path (mocked SSE) validates adapter integration without external network dependency.
- Denial-path safety improves when fallback behavior is tested in the same run rather than as an isolated unit test.

**Conventions captured**:
- For acceptance flows, avoid environment-fragile commands (e.g., git in temp dirs) and prefer deterministic process checks (e.g., `node --version`) to keep sandbox/escalation assertions stable.
- Keep CLI fast path wired to the same integrated orchestrator flow used by acceptance tests to reduce divergence between test and runtime behavior.

---

## [2026-04-07] T7 Multi-Agent Orchestration Skeleton

**What worked**:
- Modeling handoff orchestration as a small deterministic state machine made planner/coder/reviewer sequencing explicit and testable.
- Preserving shared context in one mutable object (`notes`, `handoffs`, session metadata) enabled reliable cross-role continuity without coupling role logic.
- Enforcing role transition allowlists (`planner->coder`, `coder->reviewer`, `reviewer->coder`) prevents unsupported role jumps early.
- Using transition-signature cycle detection (`from->to` repeat guard) safely halts recursive reviewer/coder loops in MVP scope.
- Max-turn policy as a hard stop provides a second independent guardrail against runaway orchestration.

**Conventions captured**:
- Keep role prompts centralized in one module so orchestration behavior and role instructions evolve independently.
- Persist handoff reason + turn index as first-class metadata for downstream auditability and debugging.
- Treat missing `handoffTo` as successful terminal completion; treat invalid handoff and repeated transition as explicit stopped statuses.

---

## [2026-04-07] T3 CLI Streaming Baseline

**What worked**:
- Using Node.js `readline.createInterface()` provides robust cross-platform CLI input loop without external dependencies.
- `process.stdout.write()` for incremental chunk rendering keeps output non-blocking and responsive during streaming.
- SIGINT handler with state check (`currentRunController !== null`) gives deterministic Ctrl+C semantics: cancel-current-run vs exit-shell.
- AbortController + AbortSignal pattern propagates cancellation cleanly through async streaming loop without race conditions.
- Session persistence in `~/.private-agents/sessions/` as JSON files provides local-first storage without database dependencies.
- `os.homedir()` gives consistent cross-platform path for user-scoped session storage on Windows.

**Conventions captured**:
- CLI entrypoint should check for fast-path flags (--version) before expensive initialization (session manager, readline).
- Streaming renderer separates `renderLine()` (complete line with newline) from `renderChunk()` (partial content) for clear streaming semantics.
- Session state mutations (addTurn, saveInterrupted, saveCompleted) immediately persist to disk - no in-memory-only state.
- Session IDs use `sess_{random}_{timestamp}` format for uniqueness and chronological sorting.
- Interrupt handler must reset `currentRunController` to null synchronously after abort to avoid state confusion on rapid Ctrl+C.
- Manual test evidence with implementation code snippets is acceptable when runtime environment (tsx not in PATH) prevents automated test execution.

**Windows-first considerations**:
- PowerShell does not support `&&` operator - must use `;` with `if ($?)` for conditional command chaining.
- SIGINT works cross-platform via Node.js - no Windows-specific signal handling needed for MVP.
- `process.stdout.write()` flushes immediately on Windows Terminal - no manual flush required.
- Session directory path uses `path.join()` for platform-correct separators.

**Integration points for future tasks**:
- T4 model adapter will replace `simulateStreamingResponse()` placeholder with real provider streaming.
- T7 multi-agent orchestration can hook into the turn loop after `sessionManager.addTurn()`.
- T5 sandbox enforcement can gate tool execution before entering streaming response.
- T9 interrupt/resume can leverage session status ('interrupted', 'active') to restore partial runs.

---

## [2026-04-07] T1 Runtime Contracts Foundation

**What worked**:
- Using a single discriminated `kind` field across all payload families keeps TS/Rust/Python definitions aligned and easy to validate.
- Requiring `schemaVersion` in every payload as part of base validation catches cross-runtime drift early.
- Compatibility gating by major version (`E_COMPATIBILITY_UNSUPPORTED`) is a clean foundation for phased runtime migrations.
- Explicit protocol error codes (`E_SCHEMA_VERSION_REQUIRED`, `E_SCHEMA_VERSION_FORMAT`, etc.) make invalid fixture failures deterministic and automation-friendly.

**Conventions captured**:
- Contract schema and language-specific definitions should be updated together in one change set.
- Keep fixture-driven validation with both happy-path and failure-path payloads for every message family.
- Record evidence artifacts under `.sisyphus/evidence/` directly from the contract test runner for reproducible QA proof.

---

## [2026-04-07] T6 Tri-Stack Test Infrastructure

**What worked**:
- A single root runner (`node scripts/test-all-stacks.mjs`) is a better truth source than chaining npm scripts because it can enforce fail-fast behavior and clear stack attribution.
- On Windows, direct executable invocation is more reliable than `spawnSync(..., { shell: true })` for deterministic test orchestration.
- Using the configured interpreter path (`D:\conda-envs\coding_agents\python.exe`) avoids ambiguity between system Python and the intended eval environment.
- Installing Rust with `rustup` plus using `%USERPROFILE%\\.cargo\\bin\\cargo.exe` makes Rust test execution deterministic in this Windows-first setup.

**Conventions captured**:
- Smoke tests should verify real workspace artifacts (contracts, root script wiring), not placeholder `assert true` checks.
- Tri-stack failure-path verification can be driven by an explicit env var (`PRIVATE_AGENTS_FAIL_PYTHON_SMOKE=1`) so the unified runner proves non-zero exit propagation and correct attribution.
- Environment validation tooling (LSP servers, rust-analyzer) may need bootstrapping in this snapshot repo before diagnostics can be enforced.

---

## [2026-04-07] T3/T4/T5 MVP Shell Foundations

**What worked**:
- Extracting SIGINT behavior into a small helper made Windows CLI cancellation semantics testable even when process-level SIGINT delivery was flaky in child-process tests.
- The OpenAI adapter is easiest to verify through SSE fixture streams and normalization tests instead of live API coupling.
- Sandbox audit verification is more reliable through the in-memory/API-facing read path than by racing filesystem flush timing in tests.

**Conventions captured**:
- For Windows-first CLI testing, prefer invoking local `tsx` through `node node_modules/tsx/dist/cli.mjs` instead of assuming a global `tsx` executable.
- Partial subagent output must be treated as untrusted until stray files and broken references are cleaned up.
- Unit tests around adapters/policies should verify normalized shapes and classification, while one end-to-end CLI path proves the shell actually starts and streams.

---

## [2026-04-07] T4 Pluggable OpenAI-First Model Adapter

**What worked**:
- A small provider interface (`ModelProviderAdapter`) plus capability metadata keeps orchestration independent of provider wire shape.
- Streaming normalization is easier and safer when done as a stateful mapper (`createOpenAIStreamMapperState`) that merges partial tool-call argument deltas before emitting final `tool.call.completed` envelopes.
- Mapping SSE frames (`data: ...`) into typed normalized events allows deterministic tests without live API calls.
- Error normalization with explicit `kind` + `retriable` + `retryAfterMs` gives predictable behavior for retry orchestration and fallback policies.

**Conventions captured**:
- Keep provider-specific request/response mapping in `providers/<provider>/normalize.ts`; keep transport in adapter class; keep cross-provider types in `model-adapters/types.ts`.
- Normalize finish reasons and usage fields at adapter boundary, not in orchestration loop.
- Test both streaming success and failure normalization in provider-local test files before integrating adapter into runtime loop.

---

**Context**: Initializing work plan execution for private coding agents rewrite.

**Key Constraints**:
- Keep TypeScript imports ending in `.js` (even in `.ts/.tsx` files)
- `bun:bundle` feature flags are used for dead-code elimination
- Respect existing lint guard comments
- Large files contain deliberate lazy/dynamic import patterns for startup and cycle control

---

**What worked**:
- Integrating orchestration, sandbox enforcement, tool dispatcher, and streaming adapter in one focused runtime harness made cross-task contracts explicit and testable.
- Reusing the existing `ToolDispatcher + SandboxEnforcer` path in orchestration-level acceptance tests catches policy regressions that unit-only tests can miss.
- Streaming role drafts through the existing OpenAI normalization path (mocked SSE) validates adapter integration without external network dependency.
- Denial-path safety improves when fallback behavior is tested in the same run rather than as an isolated unit test.

**Conventions captured**:
- For acceptance flows, avoid environment-fragile commands (e.g., git in temp dirs) and prefer deterministic process checks (e.g., `node --version`) to keep sandbox/escalation assertions stable.
- Keep CLI fast path wired to the same integrated orchestrator flow used by acceptance tests to reduce divergence between test and runtime behavior.

---

## [2026-04-07] T7 Multi-Agent Orchestration Skeleton

**What worked**:
- Modeling handoff orchestration as a small deterministic state machine made planner/coder/reviewer sequencing explicit and testable.
- Preserving shared context in one mutable object (`notes`, `handoffs`, session metadata) enabled reliable cross-role continuity without coupling role logic.
- Enforcing role transition allowlists (`planner->coder`, `coder->reviewer`, `reviewer->coder`) prevents unsupported role jumps early.
- Using transition-signature cycle detection (`from->to` repeat guard) safely halts recursive reviewer/coder loops in MVP scope.
- Max-turn policy as a hard stop provides a second independent guardrail against runaway orchestration.

**Conventions captured**:
- Keep role prompts centralized in one module so orchestration behavior and role instructions evolve independently.
- Persist handoff reason + turn index as first-class metadata for downstream auditability and debugging.
- Treat missing `handoffTo` as successful terminal completion; treat invalid handoff and repeated transition as explicit stopped statuses.

---

## [2026-04-07] T3 CLI Streaming Baseline

**What worked**:
- Using Node.js `readline.createInterface()` provides robust cross-platform CLI input loop without external dependencies.
- `process.stdout.write()` for incremental chunk rendering keeps output non-blocking and responsive during streaming.
- SIGINT handler with state check (`currentRunController !== null`) gives deterministic Ctrl+C semantics: cancel-current-run vs exit-shell.
- AbortController + AbortSignal pattern propagates cancellation cleanly through async streaming loop without race conditions.
- Session persistence in `~/.private-agents/sessions/` as JSON files provides local-first storage without database dependencies.
- `os.homedir()` gives consistent cross-platform path for user-scoped session storage on Windows.

**Conventions captured**:
- CLI entrypoint should check for fast-path flags (--version) before expensive initialization (session manager, readline).
- Streaming renderer separates `renderLine()` (complete line with newline) from `renderChunk()` (partial content) for clear streaming semantics.
- Session state mutations (addTurn, saveInterrupted, saveCompleted) immediately persist to disk - no in-memory-only state.
- Session IDs use `sess_{random}_{timestamp}` format for uniqueness and chronological sorting.
- Interrupt handler must reset `currentRunController` to null synchronously after abort to avoid state confusion on rapid Ctrl+C.
- Manual test evidence with implementation code snippets is acceptable when runtime environment (tsx not in PATH) prevents automated test execution.

**Windows-first considerations**:
- PowerShell does not support `&&` operator - must use `;` with `if ($?)` for conditional command chaining.
- SIGINT works cross-platform via Node.js - no Windows-specific signal handling needed for MVP.
- `process.stdout.write()` flushes immediately on Windows Terminal - no manual flush required.
- Session directory path uses `path.join()` for platform-correct separators.

**Integration points for future tasks**:
- T4 model adapter will replace `simulateStreamingResponse()` placeholder with real provider streaming.
- T7 multi-agent orchestration can hook into the turn loop after `sessionManager.addTurn()`.
- T5 sandbox enforcement can gate tool execution before entering streaming response.
- T9 interrupt/resume can leverage session status ('interrupted', 'active') to restore partial runs.

---


**Context**: Initializing work plan execution for private coding agents rewrite.

**Key Constraints**:
- Keep TypeScript imports ending in `.js` (even in `.ts/.tsx` files)
- `bun:bundle` feature flags are used for dead-code elimination
- Respect existing lint guard comments
- Large files contain deliberate lazy/dynamic import patterns for startup and cycle control

---

## [2026-04-07] T1 Runtime Contracts Foundation

**What worked**:
- Using a single discriminated `kind` field across all payload families keeps TS/Rust/Python definitions aligned and easy to validate.
- Requiring `schemaVersion` in every payload as part of base validation catches cross-runtime drift early.
- Compatibility gating by major version (`E_COMPATIBILITY_UNSUPPORTED`) is a clean foundation for phased runtime migrations.
- Explicit protocol error codes (`E_SCHEMA_VERSION_REQUIRED`, `E_SCHEMA_VERSION_FORMAT`, etc.) make invalid fixture failures deterministic and automation-friendly.

**Conventions captured**:
- Contract schema and language-specific definitions should be updated together in one change set.
- Keep fixture-driven validation with both happy-path and failure-path payloads for every message family.
- Record evidence artifacts under `.sisyphus/evidence/` directly from the contract test runner for reproducible QA proof.

---

## [2026-04-07] T6 Tri-Stack Test Infrastructure

**What worked**:
- A single root runner (`node scripts/test-all-stacks.mjs`) is a better truth source than chaining npm scripts because it can enforce fail-fast behavior and clear stack attribution.
- On Windows, direct executable invocation is more reliable than `spawnSync(..., { shell: true })` for deterministic test orchestration.
- Using the configured interpreter path (`D:\conda-envs\coding_agents\python.exe`) avoids ambiguity between system Python and the intended eval environment.
- Installing Rust with `rustup` plus using `%USERPROFILE%\\.cargo\\bin\\cargo.exe` makes Rust test execution deterministic in this Windows-first setup.

**Conventions captured**:
- Smoke tests should verify real workspace artifacts (contracts, root script wiring), not placeholder `assert true` checks.
- Tri-stack failure-path verification can be driven by an explicit env var (`PRIVATE_AGENTS_FAIL_PYTHON_SMOKE=1`) so the unified runner proves non-zero exit propagation and correct attribution.
- Environment validation tooling (LSP servers, rust-analyzer) may need bootstrapping in this snapshot repo before diagnostics can be enforced.

---

## [2026-04-07] T3/T4/T5 MVP Shell Foundations

**What worked**:
- Extracting SIGINT behavior into a small helper made Windows CLI cancellation semantics testable even when process-level SIGINT delivery was flaky in child-process tests.
- The OpenAI adapter is easiest to verify through SSE fixture streams and normalization tests instead of live API coupling.
- Sandbox audit verification is more reliable through the in-memory/API-facing read path than by racing filesystem flush timing in tests.

**Conventions captured**:
- For Windows-first CLI testing, prefer invoking local `tsx` through `node node_modules/tsx/dist/cli.mjs` instead of assuming a global `tsx` executable.
- Partial subagent output must be treated as untrusted until stray files and broken references are cleaned up.
- Unit tests around adapters/policies should verify normalized shapes and classification, while one end-to-end CLI path proves the shell actually starts and streams.

---

## [2026-04-07] T4 Pluggable OpenAI-First Model Adapter

**What worked**:
- A small provider interface (`ModelProviderAdapter`) plus capability metadata keeps orchestration independent of provider wire shape.
- Streaming normalization is easier and safer when done as a stateful mapper (`createOpenAIStreamMapperState`) that merges partial tool-call argument deltas before emitting final `tool.call.completed` envelopes.
- Mapping SSE frames (`data: ...`) into typed normalized events allows deterministic tests without live API calls.
- Error normalization with explicit `kind` + `retriable` + `retryAfterMs` gives predictable behavior for retry orchestration and fallback policies.

**Conventions captured**:
- Keep provider-specific request/response mapping in `providers/<provider>/normalize.ts`; keep transport in adapter class; keep cross-provider types in `model-adapters/types.ts`.
- Normalize finish reasons and usage fields at adapter boundary, not in orchestration loop.
- Test both streaming success and failure normalization in provider-local test files before integrating adapter into runtime loop.

---
