# Route 181: Targeted context planning

## Goal

Build a deterministic targeted context packet and planning surface for explicit code targets.

Recent edit routes made Execution / Edit / Verification strong. The current bottleneck is now Reading / Context Gathering and Analysis / Planning:

- reading is still mostly explicit-path and heuristic
- repo-explain discovery is narrow
- planning is rule-heavy and scattered
- WorkflowTaskPlan has useful shape but weak independent plan evidence
- edit execution can outpace context quality

Route 181 should improve agent intelligence before expanding edit again.

This route owns:

- targeted context packet for explicit files
- deterministic import / sibling test / docs / call-site candidate discovery
- bounded read budget and redaction
- planning context summary
- continuation-safe context evidence
- plan-quality stopped surface when context is missing
- focused verifier gate for context discovery

This is a read/plan substrate route, not an edit execution route.

## Expected outcome

By the end of Route 181:

1. Given an explicit target file, the system can build a budgeted context packet.
2. The packet can include direct imports, local sibling files, nearby tests, docs/readme references, and simple call-site candidates.
3. The packet is read-only and carries no mutation authority.
4. The packet is redacted, budgeted, replay-safe, and continuation-safe.
5. Agent planning can consume the packet summary instead of guessing from one file.
6. Complex edit requests can stop with "missing context / suggested reads" rather than generic unsupported.
7. Session / Continue can summarize which context was inspected and which candidates remain.
8. A focused verifier proves deterministic context discovery, budget, redaction, and no-write behavior.
9. No broad semantic index, LSP, embedding, provider call, or mutation path is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/architecture/workspace-file-context-contract.md`
- `docs/foundation/foundation-risk-register.md`

Read only if touched code points there:

- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/verifier-module-extraction.md`

Do not read edit expansion docs, browser docs, provider docs, or historical extraction docs unless code requires them.

## Reference scan

Use references only for context gathering, trajectory, planning, and task context patterns.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`
- `/home/wang/projects/OpenHands`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- gemini-cli: max 8 files
- OpenHands: max 8 files
- Inspect AI: max 6 files
- mini-swe-agent: max 4 files

Focus:

- file read/context packets
- task context or workspace summaries
- import/call-site/test discovery patterns
- prompt/context budgeting
- transcript/replay-safe observations
- plan evidence and "need more context" surfaces
- verifier/eval shape for deterministic context discovery

Do not copy broad autonomous planning loops, hidden model context injection, LSP/indexer systems, embedding retrieval, or full-repo semantic search.

## Owner modules

Primary owner:

- Workspace / File Context

Collaborating owners:

- Agent Loop
- Session / Continue
- Result Surface
- Harness / Eval

Likely new files:

- `packages/ts-shell/src/orchestration/contextPacket.ts`
- `packages/ts-shell/src/orchestration/contextDiscovery.ts`
- `packages/ts-shell/src/orchestration/contextBudget.ts`
- `packages/ts-shell/src/orchestration/contextPlan.ts`
- `packages/ts-shell/src/orchestration/contextPacketResult.ts`
- `packages/ts-shell/src/orchestration/contextPacket.test.ts`
- `packages/ts-shell/src/orchestration/contextDiscovery.test.ts`
- `packages/ts-shell/src/orchestration/contextBudget.test.ts`
- `packages/ts-shell/src/orchestration/contextPlan.test.ts`

Likely touched files:

- `readInspectModule.ts`
- `readInspectIntent.ts`
- `targetResolution.ts`
- `workspaceFileContract.ts`
- `workspaceTargetProjection.ts`
- `workflowTaskPlanner.ts`
- `continuationModule.ts`
- `resultSurfaceModule.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `verify-real-user-capabilities` or focused verifier files only if adding a gate

Touch `runMvpIntegratedFlow.ts` only as a thin composition point.

## Implementation tasks

### 1. Audit current read/context behavior

Before changing behavior, determine:

- how explicit target read currently works
- how repo-explain candidates are discovered
- where read windows and fragment fingerprints are produced
- what context is continuation-safe today
- how complex requests currently stop when context is missing
- what tests cover read/inspect and continuation

Summarize the audit in the final report.

### 2. Define context packet

Add `contextPacket.ts`.

A context packet should include:

- packet id
- root target file
- target safe label
- target kind
- read budget
- context sources
- selected candidate summaries
- omitted candidate summaries
- confidence / completeness status
- stale/freshness facts where available
- redaction status
- replay-safe summary
- mutation authority: `not-granted`

Context source kinds:

- target file summary
- direct imports
- sibling files
- nearby tests
- docs/readme references
- call-site candidates
- omitted-over-budget candidates
- unavailable source

The packet must not include raw full file dumps, secrets, provider config paths, credentials, raw hidden context, or mutation authorization.

### 3. Deterministic discovery

Add `contextDiscovery.ts`.

Discovery should be deterministic and bounded.

Supported discovery:

- direct import path extraction for TS/JS files
- same-directory sibling candidates
- nearby test files by naming convention
- docs/readme candidates in repo or nearby directories
- simple textual call-site candidates using exported symbol / basename / function name when safely available

Discovery limits:

- max candidate count
- max files read
- max bytes per file
- max total packet budget
- stop/omit with reason when over budget

Do not add LSP, ripgrep-all semantic search, embeddings, provider calls, or full repository scanning.

### 4. Budget and redaction

Add `contextBudget.ts`.

Budget should classify:

- included
- omitted-over-file-budget
- omitted-over-total-budget
- omitted-binary-or-unsupported
- omitted-out-of-workspace
- omitted-secret-risk
- omitted-unreadable

Every packet must have redaction status.

Raw content must be summarized or excerpted only within existing safe read-window conventions.

### 5. Planning context summary

Add `contextPlan.ts`.

Given a context packet, produce a planning summary:

- what is known
- what is missing
- likely related files
- likely tests
- suggested next reads
- suggested verification candidates
- confidence: high / medium / low
- execution readiness: ready / needs-more-context / unsupported

This is not a mutation plan.

### 6. Agent loop integration

Wire the packet as a thin composition path.

Behavior:

- explicit read/explain/plan prompts can request a context packet
- complex edit prompts with explicit target can build context packet before deciding unsupported or edit-ready
- when context is insufficient, Result Surface can show missing-context stopped result with suggested reads
- edit execution should not be broadened by context packet existence

Do not let context packet grant write authority.

### 7. Result Surface integration

Add `contextPacketResult.ts`.

Terminal outcomes:

- context packet created
- context packet partial / budget-limited
- missing target
- no related context found
- needs more context before planning
- unsupported broad planning request

Output should show:

- target
- included context source counts
- omitted counts and reasons
- suggested next reads
- no-write status

No raw content dumps.

### 8. Session / Continue integration

Session / Continue should preserve:

- packet id
- target summary
- included source summaries
- omitted candidate reasons
- suggested next reads
- plan confidence
- no-write/mutationAuthority:not-granted

`/continue` should be able to:

- explain what context was inspected
- continue reading omitted candidates
- use prior packet summary for planning
- avoid raw file dumps

### 9. Focused verifier gate

Add a focused context-discovery verifier if clean.

Gate should prove:

- explicit target creates packet
- direct import candidate discovered
- sibling test candidate discovered
- docs/readme candidate discovered
- simple call-site candidate discovered when deterministic
- over-budget candidates are omitted with reason
- out-of-workspace candidate is omitted
- no mutation authority is granted
- raw content/secrets excluded
- continuation-safe summary present

Prefer integrating with existing verifier modules rather than adding a new broad test runner.

### 10. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades or flows are added
- foundation risk register if read/planning risk changes
- module backlog if route status is tracked

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation behavior change
- no edit capability expansion
- no provider/model calls
- no browser work
- no LSP integration
- no embedding/vector search
- no full-repo semantic index
- no broad generated planning
- no workspace authority weakening
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- context packet tests
- discovery tests
- budget/redaction tests
- planning summary tests
- read/inspect regression tests
- target resolution tests
- Session / Continue tests if touched
- Result Surface tests if touched
- focused verifier gate if added
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Run edit closeout only if edit execution files are touched.

## Final report

Include:

1. What changed
2. Current read/context audit
3. Context packet behavior
4. Discovery behavior
5. Budget/redaction behavior
6. Planning summary behavior
7. Result Surface behavior
8. Session / Continue behavior
9. Verifier coverage
10. Validation
11. Remaining risks
12. Next route recommendation
