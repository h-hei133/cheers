# Route 194: Provider proposal anchoring

## Goal

Convert provider/generated proposal output into reviewable exact anchors when possible, without enabling direct fuzzy/generated mutation.

Routes 181-193 established:

- targeted context packets
- bounded context graph and code intelligence trace
- Agent Plan and Plan Quality
- task lifecycle loop
- task-driven context acquisition and analysis calibration
- context-aware provider proposal
- real-provider proposal dry-run gate
- provider prompt audit
- provider output validator
- anchor quality classifier
- proposal review/apply bridge
- exact hunk-set apply
- verification/repair loop

Route 193 validates provider output but does not try to turn partial/semantic provider output into exact apply-ready hunks. Route 194 should add the anchoring layer:

- extract proposed changes from provider/generated proposal output
- match them against context/code graph facts
- produce exact old/new anchor candidates when possible
- classify ambiguity, conflicts, fuzzy output, broad output, and missing target facts
- create reviewable anchored proposal manifests
- update anchor quality / plan quality / harness scorecard
- allow handoff only when anchors are exact and explicitly confirmed
- keep non-exact output no-write

This route improves semantic proposal usefulness while preserving exact apply safety.

## Expected outcome

By the end of Route 194:

1. Provider/generated proposal output can be converted into anchor candidates.
2. Anchor candidates are bound to explicit target files and evidence ids.
3. Exact candidates can become proposal hunks with old/new mappings.
4. Partial/fuzzy/broad/unanchored candidates remain review-only/no-write.
5. Ambiguous candidates stop with suggested reads or confirmation requirements.
6. Anchor conflicts and overlapping hunks are detected before any apply.
7. Anchor quality is updated after anchoring, not only from raw provider output.
8. Plan Quality and Harness Scorecard reflect anchoring readiness and failure reasons.
9. Session / Continue can explain anchoring results and what is needed next.
10. Confirmed exact anchored proposals can use existing proposal review/hunk-set apply path.
11. No direct provider-generated mutation, fuzzy apply, new writer, or automatic apply is introduced.

## Required docs

Read first:

- `docs/ACTIVE_CONTEXT.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- `docs/foundation/foundation-risk-register.md`
- `docs/architecture/cross-capability-result-flow.md`
- `docs/architecture/workspace-file-context-contract.md`

Read only if touched:

- provider boundary docs
- `docs/architecture/tool-policy-result-contract.md`
- `docs/architecture/runtime-receipt-contract.md`
- `docs/architecture/session-substrate-seams.md`
- verifier module docs
- future edit contract if proposal/apply status changes materially

Do not read browser docs or old route docs unless code directly requires them.
Do not read GitNexus unless code graph/query matching needs reference.
Do not read pi unless harness scorecard/failure taxonomy needs reference.

## Reference scan

Use references only for patch anchoring, proposal validation, fuzzy-to-exact conversion, review/apply boundaries, and scoring.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/gemini-cli`

Secondary, only if needed:

- `/home/wang/projects/GitNexus`
- `/home/wang/projects/pi`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- gemini-cli: max 10 files
- optional GitNexus/pi/Inspect/mini-swe-agent: max 8 files total

Focus:

- patch proposal validation
- exact anchor / hunk extraction
- fuzzy or malformed output handling
- diff review and confirmation
- apply permission separation
- result/scorecard wording

Do not copy:

- direct fuzzy patch apply
- autonomous repair loops
- broad patch engines
- provider-generated direct mutation
- new writer behavior
- external dependencies
- new CLI/TUI systems

## Owner modules

Primary owners:

- Edit / Patch proposal layer
- Provider / Model
- Workspace / File Context
- Result Surface

Collaborating owners:

- Agent Loop Planning
- Harness / Eval
- Session / Continue
- Permission / Policy

Likely new files:

- `packages/ts-shell/src/orchestration/providerProposalAnchors.ts`
- `packages/ts-shell/src/orchestration/providerAnchorCandidate.ts`
- `packages/ts-shell/src/orchestration/providerAnchorMatcher.ts`
- `packages/ts-shell/src/orchestration/providerAnchorConflict.ts`
- `packages/ts-shell/src/orchestration/providerAnchoredProposal.ts`
- `packages/ts-shell/src/orchestration/providerAnchoringResult.ts`
- `packages/ts-shell/src/orchestration/providerProposalAnchors.test.ts`
- `packages/ts-shell/src/orchestration/providerAnchorCandidate.test.ts`
- `packages/ts-shell/src/orchestration/providerAnchorMatcher.test.ts`
- `packages/ts-shell/src/orchestration/providerAnchorConflict.test.ts`
- `packages/ts-shell/src/orchestration/providerAnchoredProposal.test.ts`
- `packages/ts-shell/src/orchestration/providerAnchoringResult.test.ts`

Likely touched files:

- `providerOutputValidator.ts`
- `providerAnchorQuality.ts`
- `providerDryRunResult.ts`
- `realProviderProposalDryRun.ts`
- `providerEditProposal.ts`
- `providerEditResult.ts`
- `contextAwareProviderProposal.ts`
- `contextAwareProviderResult.ts`
- `editProposalReview.ts`
- `editProposalSelection.ts`
- `editProposalApply.ts`
- `proposalHunkSet.ts`
- `proposalHunkSetPlan.ts`
- `proposalHunkSetRoute.ts`
- `exactHunkSet.ts`
- `exactHunkConflict.ts`
- `exactHunkApply.ts`
- `codeGraphTrace.ts`
- `codeGraphQuery.ts`
- `codeGraphImpact.ts`
- `planQuality.ts`
- `planQualityGate.ts`
- `harnessTrace.ts`
- `harnessScorecard.ts`
- `harnessFailureTaxonomy.ts`
- `sessionResultParity.ts`
- `continuationEvidenceParity.ts`
- `stoppedSessionContinuity.ts`
- `sessionResumeContextBuilder.ts`
- `scripts/verify-context-planning.mjs`
- `scripts/verify-edit-capability-closeout.mjs`

Touch `runMvpIntegratedFlow.ts` only as a thin composition point if absolutely required.

## Implementation tasks

### 1. Audit current provider proposal anchoring gap

Before changing behavior, determine:

- how provider output validation currently classifies exact / partial / fuzzy / malformed output
- how anchor quality is computed today
- whether provider output can currently become exact hunks
- whether partial anchors are preserved as review-only evidence
- how proposal review/apply handles provider output
- how exact hunk-set apply expects hunks
- how Session / Continue explains provider dry-run output
- what verifier proves about no-write provider proposals

Summarize this audit in the final report.

### 2. Anchor candidate model

Add `providerAnchorCandidate.ts`.

Candidate should include:

- candidate id
- source proposal id
- source dry-run id if available
- source provider output validation id
- target file label
- target evidence ids
- proposed operation kind
- old-anchor status
- new-content status
- exactness
- confidence
- ambiguity status
- unsupported reason if any
- redaction status
- mutationAuthority:not-granted

Candidate must not include raw full file dumps, provider credentials, hidden reasoning, or unbounded provider output.

### 3. Proposal anchor extraction

Add `providerProposalAnchors.ts`.

Extract candidate anchors from existing structured provider/generated proposal manifests.

Supported source states:

- exact single-target output
- exact hunk-set output
- partial-anchor output
- unanchored generated output
- fuzzy output
- broad refactor output
- malformed / unsafe output

Behavior:

- exact structured output produces exact candidates
- partial output produces review-only candidates
- unanchored/fuzzy/broad output remains no-write with do-next
- unsafe/malformed output remains blocked/stopped
- extraction never writes files

### 4. Anchor matching

Add `providerAnchorMatcher.ts`.

Match candidates against available facts:

- explicit target facts
- context packet summaries
- code graph trace / impact facts
- current file content through existing safe read path when needed
- exact hunk match uniqueness
- target path authority facts

Matching outcomes:

- `exact-match`
- `single-candidate-needs-review`
- `multiple-candidates-ambiguous`
- `no-match`
- `stale-context`
- `target-missing`
- `out-of-workspace`
- `unsupported`

Do not perform fuzzy replacement. Matching can use provider output to locate exact old text only if old text is explicit and bounded.

### 5. Conflict detection

Add `providerAnchorConflict.ts`.

Detect:

- duplicate candidates
- overlapping hunks
- conflicting replacements
- multiple candidates for same target/range
- stale match facts
- target-set over max guard
- hunk-set over max guard
- multi-hunk conflicts already handled by exact hunk modules

Conflict results should stop before apply and remain no-write.

### 6. Anchored proposal manifest

Add `providerAnchoredProposal.ts`.

Manifest should include:

- anchored proposal id
- source provider proposal id
- source dry-run id
- candidate ids
- exact hunk ids if produced
- partial/review-only candidate ids
- unsupported candidate ids
- anchor quality id
- plan quality id
- review requirement
- handoff readiness
- mutationAuthority:not-granted
- redaction status

Exact anchored hunks may be handoff-ready, but not applied without explicit review/confirmation.

### 7. Anchoring result surface

Add `providerAnchoringResult.ts`.

Terminal outcomes:

- exact anchors ready for review
- partial anchors review-only
- ambiguous anchors need target selection
- no anchors found
- stale context blocks anchoring
- unsupported fuzzy/broad output
- unsafe/malformed provider output
- anchored proposal handoff-ready
- anchored proposal applied only if existing explicit apply path runs

Output should show:

- proposal id
- candidate count
- exact/partial/unsupported counts
- anchor quality
- missing facts
- suggested reads
- no-write status

No raw provider output or raw file dumps.

### 8. Anchor quality integration

Update `providerAnchorQuality.ts`.

Anchor quality should consider:

- extraction result
- match result
- conflict result
- exact hunk readiness
- context staleness
- target ambiguity
- review readiness

Levels should remain safe:

- `exact-ready`
- `review-only`
- `needs-anchoring`
- `ambiguous`
- `stale`
- `low-confidence`
- `unsupported`
- `unsafe`

### 9. Proposal review / apply integration

Update existing review/apply bridge to consume anchored proposals.

Allowed:

- confirmed exact single-target anchored proposal -> existing fenced / exact hunk path
- confirmed exact hunk-set anchored proposal -> existing hunk-set apply path
- partial/review-only anchored proposal -> no-write
- ambiguous proposal -> selection required/no-write
- stale/unsupported/unsafe proposal -> stopped/no-write

No new writer.

### 10. Plan Quality / Harness integration

Plan Quality should consume:

- anchored proposal id
- anchor quality
- exact/partial/unsupported counts
- stale/ambiguous risk
- handoff readiness

Harness trace / scorecard should record:

- anchoring attempted
- anchor outcome
- anchor failure class
- exactness
- review readiness
- no-write status
- proposal/apply readiness

Failure taxonomy should include:

- anchor no-match
- anchor ambiguous
- anchor stale-context
- anchor conflict
- anchor unsupported fuzzy output
- anchor unsafe output
- anchor malformed output

### 11. Session / Continue integration

Session / Continue should preserve:

- anchored proposal id
- source proposal id
- candidate summary
- anchor quality
- exact/partial/unsupported counts
- ambiguity/stale/conflict reasons
- handoff readiness
- review requirement
- do-next text
- no-write status

`/continue` should explain:

- whether provider output was anchored
- why anchoring failed or remained review-only
- what target selection or context read is needed
- whether exact hunks are ready for review
- whether apply still requires explicit confirmation

### 12. Verifier coverage

Strengthen focused verifier coverage.

Required deterministic coverage:

- exact provider output becomes exact anchored proposal no-write
- partial-anchor output becomes review-only anchored proposal
- fuzzy output remains no-write unsupported
- broad output remains no-write unsupported
- malformed output remains stopped/no-write
- ambiguous anchor requires selection
- stale context blocks exact anchoring
- overlapping/conflicting anchors stop no-write
- exact anchored hunk-set can hand off to existing review/apply path after explicit confirmation
- anchor quality appears in proposal/session/scorecard
- anchored proposal never grants mutation authority
- raw provider output/full file content excluded
- result-contract compatibility

Run edit closeout if edit proposal/apply verifier files are touched.

### 13. Coupling guard

Do not implement anchoring inline in `runMvpIntegratedFlow.ts`.

Desired flow:

- provider dry-run / provider proposal manifest
- anchor extraction facade
- anchor matching facade
- conflict facade
- anchored proposal manifest
- review/apply bridge
- Result Surface / Session parity
- Harness scorecard

No broad agent-loop rewrite.

### 14. Docs update

Update long-lived docs only where status changes:

- implementation manifest / recipes if new facades/flows are added
- foundation risk register if provider anchoring risk changes
- module backlog if route status is tracked
- future edit contract only if proposal/apply status changes materially

No large architecture doc.

## Boundaries

Hard boundaries:

- no mutation from provider output alone
- no unconfirmed apply
- no direct fuzzy apply
- no broad/generated direct mutation
- no provider call during apply
- no provider call by default
- no manual private provider config reads
- no new writer
- no command execution behavior change
- no command allowlist expansion
- no browser work
- no LSP / embeddings / full-repo index
- no persistent Graph DB / MCP backend
- no hidden chain-of-thought persistence
- no workspace authority weakening
- no Result Surface bypass
- no transcript schema change
- no CLI redesign
- no package dependency changes
- no broad `runMvpIntegratedFlow.ts` refactor

## Validation

Run focused validation based on touched files:

- anchor candidate tests
- anchor extraction tests
- anchor matcher tests
- anchor conflict tests
- anchored proposal tests
- anchoring result tests
- provider output validator regression tests
- provider anchor quality regression tests
- dry-run result regression tests
- proposal review/apply regression tests
- hunk-set/exact hunk regression tests if touched
- Plan Quality regression tests if touched
- Session / Continue tests if touched
- Harness scorecard/failure taxonomy tests if touched
- context-planning verifier
- edit closeout verifier if touched
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- JSON parse guard if manifest changes
- package guard if package files are touched unexpectedly
- `rtk git diff --check`
- `rtk git status --short --branch`

Do not run real-provider gates by default.

## Final report

Include:

1. What changed
2. Current anchoring gap audit
3. Anchor candidate behavior
4. Anchor extraction behavior
5. Anchor matching behavior
6. Conflict detection behavior
7. Anchored proposal behavior
8. Review/apply integration
9. Plan Quality / Harness integration
10. Session / Continue behavior
11. Verifier coverage
12. Coupling guard
13. Validation
14. Remaining risks
15. Next route recommendation
