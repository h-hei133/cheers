# Task Capability Map

This document defines the target capability model for an agent that reliably
completes real tasks. It covers coding and non-coding work. It is not evidence
that this project already has these capabilities.

Current evidence shows a strong trusted runtime substrate: report-safe
execution receipts, provider/tool/mutation boundaries, session/replay facts,
host JSON output, deterministic evaluation lanes, and evidence/result-owned
truth. Real task completion requires more: the agent must understand a goal,
choose useful context, plan, act, verify, recover, collaborate, and deliver
artifacts without forcing the user to specify every implementation step.

## Capability Separation

| Capability class | Meaning | Success evidence |
|---|---|---|
| Trusted runtime capability | The agent acts through governed side-effect boundaries, preserves redaction, keeps state distinctions, and avoids false success. | Owner tests, receipts, redaction checks, evidence/result verdicts, host truth facts. |
| Task completion capability | The agent can turn an underspecified goal into useful completed work by discovering context, planning, executing, verifying, debugging, recovering, and reporting. | Completed real task runs or task-bench cases with task-relevant verification and artifacts. |
| Product workflow capability | The product helps users and hosts drive work through CLI, host, sessions, artifacts, automation, status, blockers, and continuation. | Usable product flows with durable sessions, structured host events, collaboration surfaces, and workflow checks. |
| Live execution capability | The same behavior works with real providers and real workspaces, not only synthetic or injected fixtures. | Explicit opt-in live runs with clean homes, redaction, failure attribution, and task-relevant proof. |

Trusted behavior is necessary but insufficient. A safe agent that only reports
why work is not proven is not yet a useful task-completion agent.

## Target Task Lifecycle

| Stage | Required capability | Mature behavior pattern | Local translation |
|---|---|---|---|
| Goal intake | Parse user intent, task kind, constraints, desired artifact, success criteria, allowed writes, and deadline. | Session host accepts prompts, command input, queued follow-ups, and mode-specific options before a turn starts. | Add a task-goal owner that produces report-safe goal facts and ambiguity questions before provider or mutation lanes. |
| Ambiguity handling | Detect missing target, conflicting instructions, unsafe writes, unclear success criteria, and ask the smallest useful question. | Interactive sessions support steering, follow-up queues, command context, and UI prompts. | Build a collaboration policy that can ask, proceed with bounded assumptions, or block, while preserving not-proven facts. |
| Workspace discovery | Identify repo shape, package scripts, likely target files, related tests, docs, artifacts, and exclusions. | Mature implementations rebuild context from session and resources, and separate host/session behavior from the low-level loop. | Strengthen `context/discovery` and `context/acquisition`; use bounded scans, graph/test-impact facts, and omission accounting. |
| Context selection | Select minimal but sufficient context, expand when evidence is weak, and carry continuation memory safely. | Session tree, compaction, branch summaries, resources, and context files feed the next turn. | Treat context packets and memory as planning inputs only; freshness, omissions, unsafe paths, and stale summaries must remain visible. |
| Planning | Produce executable steps, assumptions, risks, target owners, verification intent, and fallback triggers. | Harness separates per-turn state and save points from the loop. | Planning belongs in `planning/`; loop observes planning facts but cannot turn a plan into success. |
| Tool strategy | Choose read, shell, edit, verification, artifact, and host operations based on task type and authority. | Tools expose model-facing content, structured details, hooks, sequential/parallel execution, and result messages. | Use `tools`, `tools/policy`, `runtime/execution`, `turn`, and artifact owners; never bypass `ExecutionService`. |
| Safe mutation | Apply writes only after authority, stale-read, conflict, snapshot/restore, and target checks. | File mutation queues and tool execution controls preserve ordering and conflict safety. | Continue bounded mutation through edit owners; broad arbitrary writers and uncontrolled parallel mutation stay deferred. |
| Verification choice | Pick task-relevant checks: tests/build for code, rendered/parsed output for docs, data checks for analysis, and artifact inspection for reports/slides. | Programmatic and interactive modes expose events and session facts for automation and user inspection. | Verification belongs in `verification/`; selected-not-run, skipped, fake, default, readback-only, or provider-called evidence is not success. |
| Debugging | Classify failures, inspect the failing owner, gather missing context, and revise plan/tool choice. | Runtime distinguishes provider, tool, compaction, session, retry, abort, and error states. | Build a live debug loop that carries failure taxonomy through context, planning, repair, and re-verification. |
| Retry and recovery | Retry only when failure class, freshness, authority, and cost allow it; preserve original failures. | Mature loops support retries, aborts, compaction failure, queued input, and session reload. | Recovery must keep original failure, attempted repair, skipped follow-on work, and post-repair verification distinct. |
| Continuation | Resume long tasks with compact but fresh context, prior artifacts, open blockers, and next action. | Sessions are durable trees with compaction and branch summaries. | Session continuation must carry task state, not just transcript summary; summaries remain context aids, not proof. |
| Provider prompting | Shape provider requests with goal, relevant context, tool policy, output contract, verification expectations, and anti-false-success instructions. | Model registry and request boundaries prepare provider/model metadata and stream behavior. | Prompt shaping belongs at provider/request and planning boundaries; provider output is proposal/fact input, not success. |
| Reusable capabilities | Allow commands, workflows, prompts, skills, or packages to package repeatable behavior with governance. | Extensions and packages can register tools, commands, UI, state, providers, and resources. | Prefer static, typed, default-disabled capability descriptors before any executable extension or package loading. |
| Artifact workflows | Produce and verify documents, reports, data outputs, slides, exports, and summaries as first-class deliverables. | Sessions can export, render tool messages, and preserve custom entries. | Add artifact owners with content plans, source receipts, validation checks, and durable paths; do not hide unverified artifacts behind runtime completion. |
| Host automation | Let non-interactive callers start, continue, inspect, stop, cancel, and evaluate work without scraping terminal text. | JSON event stream, SDK, and RPC expose structured programmatic usage. | Build on `runtime/api/host` and `host-json-response.v1`; broad SDK/RPC server behavior requires a scoped consumer. |
| Progress reporting | Show user-visible progress, assumptions, blockers, next action, and proof state without claiming success early. | Interactive surfaces render lifecycle, tool, compaction, queue, and session events. | Product surfaces render facts from owners; status, events, replay, and terminal rendering stay non-success. |
| Real task evaluation | Evaluate end-to-end useful outcomes across coding and non-coding tasks, not just safe fact projection. | Public SDK/docs highlight programmatic testing and automated workflows. | Create a real task bench with explicit success rubrics, clean workspaces, deterministic fixtures first, and opt-in live-provider triage later. |

## Coding Work

A coding-capable agent needs all of the following working together:

- Goal and target resolution: task kind, owner domain, target files, related
  tests, allowed writes, and expected behavior.
- Context graph: package scripts, imports, symbols, test-impact hints, docs that
  are relevant, and omitted context accounting.
- Plan and mutation policy: exact target scope, authority state, stale-read
  checks, conflict detection, snapshot/restore, and bounded parallelism only
  where proven.
- Debug loop: classify test/build/provider/tool/edit failures, gather missing
  evidence, revise plan, apply repair, and re-run task-relevant verification.
- Completion proof: relevant tests or build passed after the final change, no
  unverified write outcome, and evidence/result verdict proves completion.

## Non-Coding Work

Reliable non-code task completion needs first-class artifact handling instead
of forcing everything through edit/mutation vocabulary:

- Summaries and reports need source receipts, scope boundaries, citation or
  provenance policy, consistency checks, and final artifact inspection.
- Data analysis needs data source identity, parsing/transform checks, result
  validation, and reproducible commands or notebooks only through sanctioned
  execution.
- Documents and slides need outline planning, asset/source management, rendered
  artifact checks, format validation, and user-facing delivery paths.
- Research-like work needs uncertainty labeling, source freshness checks when
  needed, and explicit evidence-vs-inference separation.

## Evidence Standards

The following are not task completion evidence by themselves:

- provider called, provider completed, provider stream projected, tool call
  extracted, tool executed, apply observed, repair proposed, command selected,
  command skipped, replay ready, session status complete, event emitted, JSON
  emitted, package smoke passed, or terminal exit zero.
- focused, fake, synthetic, default, readback-only, selected-not-run, or
  provider-output-only evidence unless the task explicitly requires only that
  narrow behavior.

Task completion requires a task-relevant verdict tied to the requested work.

## Source Patterns Used

This map is based on current local code/tests, the sprint capability docs, the
prior targeted mature-implementation audits, targeted inspection of the mature
local harness/loop/session files, and current public docs for sessions,
compaction, JSON event stream, SDK, extensions, and packages. Those references
are behavior inputs only; product code and product-facing names must stay
domain-based.
