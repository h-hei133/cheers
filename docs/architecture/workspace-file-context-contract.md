# Workspace / File Context Contract

Route: `docs/agent-routes/route151-workspace-file-context-contract.md`

## Scope

Route 151 adds a shared contract for workspace/file target facts already used by
read/inspect, bounded edit/write, continuation rebase, future edit planning,
stale-read checks, and post-write verification preconditions.

The contract is a projection seam:

- `packages/ts-shell/src/orchestration/workspaceFileContract.ts` owns pure
  workspace root, target, authority, stale-read, verification-precondition, and
  safe-label facts.
- `packages/ts-shell/src/orchestration/workspaceTargetProjection.ts` owns
  stopped target summaries, read-only/write-authority summaries,
  continuation-safe summaries, and future discovery candidate summaries.
- Existing read/edit/continuation callers consume the projection only where the
  current result text and authority behavior are preserved.

This route does not add file discovery, broaden read/search/write capability,
change stale-read behavior, change workspace authority, alter CLI/schema
behavior, add dependencies, or move policy into Agent Loop.

## Vocabulary

| Term | Meaning | Current owner |
|---|---|---|
| workspace root | selected runtime workspace used to bind relative paths | `runMvpIntegratedFlow.ts`, tool dispatch, workspace authority |
| project root | narrower project context when known; not an authority source by itself | orchestration/session context |
| target path | explicit normalized file path selected by the route | `targetResolution.ts`, edit/read plans |
| target hint | prompt-derived path-like hint that is not yet a concrete target | read/edit planning |
| concrete target | one explicit in-workspace target selected for read or write planning | read/edit routes |
| candidate target | a possible file candidate that still needs selection | continuation relocation, future discovery |
| ambiguous target | more than one candidate remains; route must stop for explicit selection | target resolution, repo explain, continuation |
| missing target | no concrete target is available; route must stop actionably | read/edit/future edit |
| read authority | target may be summarized/read by a no-write route | read/inspect route and read tool lifecycle |
| write authority | target passed workspace write authority checks | `patchResult/workspaceAuthority.ts` |
| stale-read evidence | final freshness precondition immediately before mutation | mutation execution and patchResult write lanes |
| post-write verification precondition | verification plan/facts required after a write route | patchResult write result/projection |
| continuation rebase target | prior target rebound or relocated into the current workspace | `continuationRebase.ts`, `readContinuationTarget.ts` |
| future discovery candidate set | planning-only candidate labels that do not grant mutation authority | `futureEditPlanner.ts` |

## Integrated Call Sites

High-value integrations are intentionally small:

- `editExpectationContract.ts`
  - maps no-write read/inspect targets to read-only summaries
  - maps missing edit/write targets through the shared missing-target projection
- `futureEditPlanner.ts`
  - attaches a future discovery candidate summary with `mutationAuthority:
    not-granted`
- `continuationRebase.ts`
  - attaches continuation-safe target summaries for unchanged, rebased,
    ambiguous, and missing outcomes
- `readContinuationTarget.ts`
  - attaches continuation-safe target summaries for available, relocated,
    ambiguous, and missing read targets
- `mutationExecution.ts`
  - maps stale-read failures through the shared stale-read stopped projection
    while preserving existing reason text and failure code
- `runMvpIntegratedFlow.ts`
  - reuses missing, ambiguous, and out-of-workspace target projections for
    existing read/repo-explain stopped text without changing task selection

The route does not rewrite writer execution, workspace authority decisions,
resultMapper classification, session schema, CLI flags, provider behavior,
browser behavior, or the Rust protocol.

## Contract Rules

Projection helpers are pure. They do not read files, search the filesystem, run
tools, ask providers, or mutate workspace state.

Target summaries may include normalized labels, reason codes, do-next text, and
evidence markers. They must not include raw file content, provider config,
tokens, cookies, authorization headers, or private real-provider-home paths.

Read authority and write authority remain separate:

- read-only summaries are allowed to support inspect/replay context
- write-authority summaries report facts from existing write gates only
- future discovery candidate summaries always carry `mutationAuthority:
  not-granted`

Stale-read projection is evidence only. It must not bypass the final stale-read
check, downgrade a stale target to success, or make the writer reachable.

Verification precondition projection records required and missing facts. It does
not execute verification or treat missing verification as success.

## Current Fact Map

| Surface | Existing behavior | Contract mapping | Preservation rule |
|---|---|---|---|
| targeted read missing path | stopped read-file plan with actionable do-next | missing target stopped summary | same blocked reason |
| read target outside workspace | stopped read-file plan | out-of-workspace stopped summary | same blocked reason |
| repo explain no target | insufficient evidence result | missing/ambiguous stopped summary | same failed file reason |
| no-write inspect | no mutation allowed | read-only target summary | mutation remains false |
| bounded write/edit missing target | stopped expectation | missing target stopped summary | same do-next |
| future discovery edit | planning-only | candidate summary, mutation not granted | no discovery execution |
| continuation rebase | unchanged/rebased/missing/ambiguous | continuation-safe target summary | same status and reason |
| stale-read mismatch | failed mutation, `failureCode: stale-read` | stale-read stopped summary | same reason/evidence |
| post-write verification precondition | patch/write result owned | verification precondition fact | no verification execution |

## Unsafe Areas

Do not use this contract as authority to:

- discover files broadly
- infer write permission from prompt text
- authorize mutation from read-only or future-discovery summaries
- skip workspace authority validation
- skip final stale-read revalidation
- change session transcript schema
- expose raw file contents or provider secrets in summaries

## Next Route

The best next Phase A route is Agent Loop dispatch extraction v2: move one more
pure dispatch/projection decision out of `runMvpIntegratedFlow.ts` while keeping
behavior and validation scope unchanged.
