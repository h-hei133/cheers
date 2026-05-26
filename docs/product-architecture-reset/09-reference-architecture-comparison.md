# Reference Architecture Comparison

References were inspected for structure and boundary patterns only. No
implementation code was copied.

## opencode

- Inspected: `/home/wang/projects/opencode`, especially `packages/core/src`
  and top-level package structure.
- Useful pattern: domain-sliced product core with explicit session, tool,
  permission, patch, provider, and service-style boundaries.
- Rejected pattern: adopting the whole opencode product shell or app structure.
- Reason: this repository has stricter TypeScript/Rust/contracts ownership and
  proof-carrying route constraints.
- Local implication: use opencode as naming and responsibility calibration for
  provider/tool/session/permission/edit modules.
- Confidence: high.

## OpenHands

- Inspected: `/home/wang/projects/OpenHands/openhands`, especially
  `app_server`, `event`, `sandbox`, `file_store`, `secrets`, `settings`,
  `pending_messages`, and `app_conversation`.
- Useful pattern: conversation lifecycle, event persistence, sandbox selection,
  settings/secrets, and file storage are service-separated.
- Rejected pattern: making an app-server service graph the primary architecture.
- Reason: this project is CLI/session/control-plane first and should not add a
  server persistence layer during the reset.
- Local implication: borrow event/sandbox/file-store separation ideas for
  future durable runtime surfaces, while keeping product turn logic in TS
  control-plane modules.
- Confidence: medium-high.

## mini-swe-agent

- Inspected: `/home/wang/projects/mini-swe-agent/src/minisweagent`, especially
  `agents`, `environments`, `models`, `run`, and tests.
- Useful pattern: compact separation of agent loop, model adapter, environment
  backend, and run/benchmark entrypoints.
- Rejected pattern: collapsing this product into a small Python-first loop.
- Reason: local architecture requires TypeScript orchestration, Rust execution,
  contracts, and Python eval separation.
- Local implication: use it as a minimalism benchmark for dev harness and
  trajectory reporting, not as the target runtime shape.
- Confidence: high.

## gemini-cli

- Inspected: `/home/wang/projects/gemini-cli/packages`, especially
  `packages/cli/src` and `packages/core/src` areas such as tools, sandbox,
  policy, confirmation bus, scheduler, services, MCP, routing, and config.
- Useful pattern: strong CLI/core split with policy, confirmation, sandbox,
  tool execution, and services separated from UI entrypoints.
- Rejected pattern: importing its scheduler or policy taxonomy wholesale.
- Reason: local rules discourage broad taxonomy expansion and require preserving
  existing safety semantics.
- Local implication: strongest reference for separating CLI presentation from
  policy, sandbox, confirmation, and tool execution modules.
- Confidence: high.

## inspect_ai

- Inspected: `/home/wang/projects/inspect_ai/src/inspect_ai`, especially
  `_eval`, `scorer`, `log`, `event`, `tool`, `approval`, `model`, and sandbox
  utilities.
- Useful pattern: task/solver/scorer/log/event separation, explicit transcript
  and scoring ownership, and eval/report clarity.
- Rejected pattern: moving runtime orchestration into Python eval semantics.
- Reason: Python eval is an evaluation layer here; replay, recovery, permission,
  and runtime durability stay in TypeScript/Rust/contracts.
- Local implication: use Inspect AI for eval/report/scorer/log architecture and
  evidence report shape, not for product control-plane ownership.
- Confidence: high.

## Cross-Reference Lessons

Adopt:

- Explicit domain ownership.
- Separate policy/permission from execution.
- Separate CLI presentation from core product semantics.
- Keep event/receipt/log/evidence surfaces visible.
- Keep eval/reporting apart from runtime mutation.
- Prefer public facades over deep cross-module imports.

Reject:

- Copying any reference repository structure wholesale.
- Server-first restructuring before product CLI architecture is stable.
- Python-first runtime orchestration.
- Taxonomy expansion that does not remove current coupling.
- Feature expansion disguised as architecture cleanup.

Local implication: the reset should not choose one reference as a template.
Instead, it should preserve the local proof-carrying safety model while
physically separating product runtime from route-era evidence and dev harnesses.
