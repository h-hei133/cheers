# Product Dataflow And Lifecycle

Key rule: capabilities produce evidence; the evidence/verdict layer determines
success; CLI/session only present truthful results.

## User Prompt To Final Verdict

```text
user prompt
  -> CLI mode and workspace binding
  -> session turn boundary
  -> agent turn kernel
  -> context and intent planning
  -> capability routes
  -> runtime/tool/provider/edit receipts
  -> safe evidence rows
  -> claim evaluation
  -> verdict projection
  -> result mapping
  -> session transcript / continuation
  -> CLI output
```

Stop condition: if any required authority, execution, observation, verification,
cleanup, or redaction evidence is missing, the verdict must remain stopped,
partial, blocked, skipped, or not-proven instead of success.

## Context And Planning Lifecycle

```text
prompt -> workspace facts -> relevant files/context -> plan
  -> planned files/actions -> confidence -> evidence
```

Planning may produce `plannedFiles`, but planned files are not changed files.
Planning-only routes must preserve `changedFiles=[]` and execution `not-run`.

## Provider To Proposal Lifecycle

```text
provider readiness
  -> explicit opt-in gate when real provider is needed
  -> provider call receipt
  -> raw output redaction boundary
  -> proposal extraction
  -> exactness / anchoring validation
  -> reviewable proposal evidence
```

Provider-called evidence is not enough. A proposal must be exact-ready and
transcript-safe before it can be reviewed or handed to edit.

## Proposal To Edit Lifecycle

```text
proposal
  -> review / confirmation
  -> selected workspace authority
  -> supported edit shape check
  -> final stale-read
  -> writer execution
  -> readback observation
  -> changed/failed file evidence
```

Prompt text alone never authorizes writes. Exact-ready proposal alone never
authorizes writes.

## Edit To Verification Lifecycle

```text
edit receipt
  -> verification plan
  -> command allowlist / policy
  -> runtime command receipt
  -> verification result
  -> claim evaluation
```

Apply without verification may be a stopped or partial state; it is not a
plain success when the task contract requires verification.

## Verification Failure To Repair Lifecycle

```text
verification failed
  -> failure evidence
  -> repair planning
  -> repair proposal
  -> proposal review
  -> edit authority
  -> apply
  -> rerun same or task-relevant verification
  -> final verdict
```

Repair must use the same proposal/edit/verdict rules as first-pass work. It
cannot bypass authority or verification because it is a repair.

## Tool, Browser, And MCP Receipt Lifecycle

```text
tool/browser/MCP request
  -> availability
  -> policy
  -> execution or explicit skip
  -> receipt
  -> safe observation
  -> evidence row
  -> claim evaluation
```

Local deterministic fixtures, external-live calls, browser unavailable states,
and MCP process/protocol failures must stay distinguishable.

## Session Continuation Lifecycle

```text
turn result
  -> transcript event
  -> compact summary
  -> continuation snapshot
  -> /continue or replay
  -> preserved planned/changed/failed files
  -> preserved blockers and next action
```

Continuation must not upgrade a stopped or partial result. It should preserve
the next actionable boundary.

## Evidence, Claim, And Verdict Lifecycle

```text
receipt facts
  -> redaction check
  -> evidence rows
  -> required claim matrix
  -> negative controls
  -> verdict: COMPLETE / PARTIAL / BLOCKED / NOT-PROVEN
  -> terminal result
```

The product should make this lifecycle reusable. Route reports can then become
outputs of a shared evidence/verdict system instead of one-off proof formats.
