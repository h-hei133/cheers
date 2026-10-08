# Architecture Boundaries

Preserve responsibility boundaries even when a shortcut would make a demo path appear usable.

## TypeScript Product Runtime And Control Plane

TypeScript is the primary product runtime and control plane. It owns:

- shell and interactive CLI
- session lifecycle and continuity
- orchestration and query loop semantics
- slash routing and shell actions
- recovery and permission UX
- replay and runtime durability
- MCP capability routing
- result mapping
- terminal/session surface
- high-level capability routing
- most current execution adapters

Keep product runtime and control-plane semantics in TypeScript.

## Execution Boundary

Execution is an explicit boundary/interface, implemented in TypeScript. `runtime/execution/service.ts` is the only implementation: it projects a result, and `runtime/execution/local.ts` spawns the process and streams its output. There is no second execution plane and no configuration that selects one.

The TypeScript execution boundary should own runtime-neutral request/result/event shapes for:

- command execution
- cancellation
- file reads and writes
- apply patch or workspace mutation handoff
- sandbox or preflight decisions
- permission and capability requirements

New direct external side effects must go through the current owner module or a documented execution/file/workspace boundary. Do not scatter `child_process`, writable `fs`, shell/PTY, browser process, MCP process, or runtime network side effects into unrelated product modules.

## Native Executor Candidate

A native module is a candidate only for responsibilities TypeScript cannot reach at all — system-level isolation (`seccomp`, namespaces, Seatbelt), where the kernel interface has no TypeScript binding. It is not a candidate for anything already reachable:

- **daemon behavior** — there is no daemon. `runtime/execution/local.ts` spawns and streams in-process.
- **timeout, cancellation, process-tree cleanup** — owned by `runtime/execution/local.ts` and `core/shell/platform/processTree.ts`.
- **sandbox preflight** — owned by `sandbox/`.
- **single-binary distribution** — `npm run build:exe` compiles the TypeScript entrypoint into one executable with no Node runtime required. This is exactly the argument a second language used to be justified by, and it is now answered inside the existing one.
- **security-sensitive execution audit** — the receipt and event projection in `runtime/execution/` is the record, and it is TypeScript.

Before adding a native module, bring a benchmark showing the TypeScript path is insufficient for the specific responsibility, and add it as an in-process binding rather than a separate process. "It would be faster" is not sufficient: execution latency is dominated by the child process being spawned.

Do not move shell, session, replay, recovery, permission, result semantics, or product orchestration into a native module for convenience.

## Contracts Boundary

`contracts` carries serialized schemas, execution events, lifecycle states, permission/request/response semantics, and versioning rules across runtimes when there is a real cross-runtime consumer.

Contract changes must keep producer and consumer semantics aligned.

`contracts` must not contain business orchestration, model/provider calls, shell helpers, file-system helpers, UI helpers, test mock convenience, or runtime side-effect code.

## Single Runtime

The product is TypeScript only. There is no Python evaluation layer and no Rust execution daemon; both were removed after measurement showed they provided nothing the TypeScript path did not already do better (see `.wiki/features/08-gap-and-debt-research.md` section 2).

Do not reintroduce a second language for performance. Execution latency is dominated by the child process a command spawns, not by the orchestrator that spawns it. If a future need is genuinely native — system-level isolation such as `seccomp`/namespaces/Seatbelt — bring a benchmark that proves the existing `sandbox/` implementation is insufficient, and add it as an in-process binding rather than a separate process.

## Domain Ownership

- Final-domain modules should own their actual responsibilities.
- Product runtime must not import docs, scripts, dev-history, or route reports.
- No new capability logic belongs in a legacy or compatibility path unless the compatibility reason is explicit and documented.
- Compatibility wrappers should delegate only.
- Do not hide permission, write authorization, or runtime lifecycle semantics behind convenience plumbing.

## Common Areas

- `packages/ts-shell/src/core/state/`: domain-neutral bounded retention and scoped change notifications; feature owners keep their state transitions and payloads.
- `packages/ts-shell/src/runtime/execution/media/`: verified media staging, native decoding/text extraction, resource budgets and cleanup admission through the existing local executor. Typed tool images follow the existing agent/turn/session/provider message path; `core/agent/media.ts` owns the shared tool-batch image budget.
- `packages/ts-shell/src/language/`: bounded language-server protocol, document versions, diagnostics and rename proposals; its process pool follows session and canonical project identity across tool catalogs. `runtime/execution/binding.ts` binds executable arguments and working-directory identity to approval; duplex process I/O and cleanup use the existing executor. Language edits enter `edit/patch/` for complete preparation and approval.
- `packages/ts-shell/src/browser/session/` owns page identities, observation refs, masked screenshots, explicit URL transfers and the existing action/cleanup lane; `browser/tool/` prepares immutable approvals and adapts results. Uploads reuse verified execution reads and source-read policy. Downloads reuse the bounded network transport and `core/session/artifacts/` publication in the existing session store; retained or unverified publication and cleanup stay visible.
- `packages/ts-shell/src/desktop/` owns explicit native desktop adapters, session snapshots, reviewed masks and approved input. Native utilities run through the existing execution service; each action binds display, utility/auth identity, project, focus, geometry and snapshot. Unreviewed screenshots are fully blacked out; input effects and process cleanup remain separate, and unknown cleanup blocks reuse.
- `packages/ts-shell/src/entrypoints/`: executable entrypoints and compatibility re-exports only; reusable CLI contracts belong under `packages/ts-shell/src/cli/`.
- Current owners for new edit/result logic include `packages/ts-shell/src/edit/`, `packages/ts-shell/src/edit/patch/`, `packages/ts-shell/src/edit/result/`, `packages/ts-shell/src/verification/`, `packages/ts-shell/src/repair/`, and `packages/ts-shell/src/result/`.
- `packages/ts-shell/src/edit/authority/` owns guarded file inspection/publication shared by ordinary writes and recovery. `edit/recovery/operation/` owns session/workspace-scoped durable edit and undo receipts; snapshots alone are not commit evidence. Command and tool entrypoints delegate to these owners.
- `packages/ts-shell/src/edit/recovery/undo/` owns scoped undo selection and command/report adaptation; `cli/interactive/picker/undo.ts` supplies explicit confirmation, and `cli/output/command.ts` projects local results and context-publication warnings. These surfaces reuse the operation restore owner rather than adding a writer.
- `tools/preparation.ts` owns the runtime-neutral one-use tool preparation capability; `turn/preparation.ts` applies endpoint admission and permission policy. Edit plans and compensation stay in `edit/`; the interactive approval reader only presents the complete prepared plan.
- `packages/ts-shell/src/core/query/`: generic query and result mapping; project feature-specific state into generic result shapes before handing it to query-level mappers.
- `packages/ts-shell/src/core/security/`: path containment, project trust, and the report-safe text redactors shared across domains - `redaction.ts` (provider paths, bearer tokens, credential assignments) and `reportText.ts` (report-unsafe markers and length caps), the latter shared by `browser/` and `presentation/`.
- `packages/ts-shell/src/core/values/`: domain-neutral value helpers with no feature knowledge - `freeze.ts` (`freezeDeep`) is the single recursive freeze used by twelve domains, and `record.ts` (`isRecord`) is the record-shape guard shared by `browser/` and `turn/`.
- `packages/ts-shell/src/core/shell/`: shell/session display surface; keep feature-specific policy and writer semantics outside this layer when possible.
- `packages/ts-shell/src/core/workspace/`: configuration-neutral root grants, directory identity and file-tool authority selection shared by session, turn and sandbox owners.
- `packages/ts-shell/src/planning/goal/` owns session-bound goal entities, transitions, legacy import, state-file CAS and budget policy. CLI composition supplies neutral command/objective/request-policy ports; core and turn code do not read feature state directly. Ordinary session saves preserve goal and request-ledger payloads, and selection/reentry is not authorization to resume an active goal.
- `packages/ts-shell/src/planning/goal/run/` owns durable scheduling claims, pending rounds, bounded stop and recovery. CLI submission hosts reuse the ordinary session runtime; timers and host registries never authorize dispatch. A round settles only against its persisted prompt origin and terminal lifecycle. A dead owner does not authorize replay of a pending round, and unknown drain or usage remains visible after shutdown.
- `packages/ts-shell/src/core/agent/request/` owns neutral model-request admission, durable attempt accounting and replay protection. `session/store/requests.ts` supplies guarded ledger publication under the existing session lock; `provider/request/attempt.ts` reserves the final serialized body and checks live policy again at transport handoff. `provider/response/metering.ts` normalizes inclusive input/output without duplicating cache or reasoning subdivisions. All actual sends, including retries, summaries and cache refresh, consume the injected policy; unknown sent usage retains its reservation, and a strict cap requires a proven complete-request bound.
- `packages/ts-shell/src/session/`: session lifecycle, durable session state, and resume/recovery boundaries.
- `scripts/`: repository-level validation scripts, readiness checks, and real-provider smoke entrypoints.
