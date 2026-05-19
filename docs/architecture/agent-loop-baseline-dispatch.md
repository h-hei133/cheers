# Agent Loop Baseline Dispatch

Route: `docs/agent-routes/route138-agent-loop-baseline-dispatch.md`

## Scope

Route 138 restored the focused `runMvpIntegratedFlow.ts` handoff/tool-approval
baseline, then extracted one small dispatch/reentry seam without changing
provider/model calls, browser behavior, edit/write behavior, permission
decisions, CLI UX, package dependencies, or session schema.

## Red Baseline Classification

Focused failing gate:

```text
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "covers prompt -> handoff -> tool approval -> streamed result"
```

Before repair it failed with:

```text
expected 'stopped_error' to be 'completed'
```

Observed runtime facts:

- bash dispatch succeeded after approval
- `approval.requested`, `approval.resolved`, and `tool.result` events were
  present
- verification status was `passed` for `node --version`
- terminal status was downgraded because the command-only result was projected
  through the mutation/edit result contract and reported `No file mutation was
  applied.`

Classification: product behavior drift in command-result projection.

Reason: `run-command` is a command capability, not an edit capability. A
successful approved command should not require file mutation evidence. Route 137
only exposed the failure; the same behavior was observed before the Route 137
projection extraction.

## Repair Decision

The repair keeps mutation routes on the existing mutation result contract and
adds command-specific projection for successful `run-command` dispatch:

- passed command plus no failed files -> satisfied command result
- failed or blocked command -> existing stopped/error projection path
- approval denied remains recoverable `stopped_error` with approval provenance

Adjacent approval tests were rebaselined to current result-mapper semantics:
approval-denied is classified as `stopped`, with `stopped_error` terminal
reason, actionable do-next text, and explicit approval/tool provenance. This
matches the capability contract rule that approval denial should be recoverable
where possible.

## Extracted Seam

New owner:

- `packages/ts-shell/src/orchestration/flowDispatch.ts`

Extracted responsibilities:

- append tool lifecycle events around dispatch
- project tool lifecycle result and provenance
- project successful run-command dispatch outcome without mutation evidence
- project continuation-safe dispatch/reentry summaries for pending approval,
  approval denied, stopped dispatch, approved dispatch, and streamed-result
  reentry

Before:

- `runMvpIntegratedFlow.ts` directly appended approval/tool events, called the
  dispatcher, projected lifecycle facts, recorded provenance, and then reused a
  mutation-only result projection for command execution.

After:

- `runMvpIntegratedFlow.ts` still owns plan selection and execution order.
- `flowDispatch.ts` owns dispatch event/result projection only.
- No tool ordering, permission decision, provider behavior, browser behavior,
  edit behavior, CLI behavior, or session persistence shape changed.

## Reference Scan

Bounded reference scan was used for shape only:

- ClaudeCode `query.ts`: keeps tool-use streaming, tool-result matching, and
  continuation state separate from model streaming.
- opencode `session/processor.ts`, `tool/tool.ts`, `permission/index.ts`:
  session processor records tool call lifecycle and permission ask/reply as
  explicit events/parts.
- OpenHands `app_server/event/README.md`: conversation events are persisted,
  queried, and streamed as an event service boundary.

No reference implementation code was copied.

## Behavior Preservation

Preserved:

- command approval still flows through `SandboxEnforcer` and `ToolDispatcher`
- denied approval still records approval and tool provenance
- failed/blocked command paths still stop through existing result mapping
- browser result/evidence projection from Route 137 is unchanged
- edit/patch mutation routes still use mutation result projection
- raw browser/page-like content is excluded from dispatch reentry summaries

Focused tests now cover:

- approved tool dispatch event order
- approval denied dispatch and resume-safe reentry
- approval pending reentry summary
- stopped dispatch summary
- streamed-result reentry summary
- redaction of raw page/secret-like detail
- successful run-command without file mutation
- repaired prompt -> handoff -> tool approval -> streamed result route

## Remaining Risks

- `runMvpIntegratedFlow.ts` still owns prompt classification, capability branch
  selection, and final branch-local result assembly.
- The existing `dir/list-directory` test expectation is stale against the
  current narrow command allowlist; it still maps unsupported command-like
  prompts to the default allowlisted `node --version` path. This was not fixed
  in Route 138 because it is command intent/allowlist policy, not dispatch
  reentry.
- Full `runMvpIntegratedFlow.test.ts` was not used as a route gate.

## Route 139 Recommendation

Proceed with a projection-only tool/policy/result contract seam:

1. normalize policy reason codes across approval, command allowlist, MCP, and
   browser policy without changing decisions; or
2. project tool lifecycle results into a shared capability-result summary
   consumed by result/session surfaces.

Stop if the next step requires provider/auth changes, browser/edit expansion,
CLI UX changes, session schema changes, or a broad runMvp rewrite.
