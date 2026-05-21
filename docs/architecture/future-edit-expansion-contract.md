# Future Edit Expansion Contract

Route: `docs/agent-routes/route147-future-edit-contract.md`

## Scope

Route 147 defines future edit expansion contracts without enabling broad edit
execution. It preserves the Route 143 current edit contract and the Route 146
tool/policy/result vocabulary.

This route adds planning-only helpers:

- `packages/ts-shell/src/orchestration/futureEditContract.ts`
- `packages/ts-shell/src/orchestration/futureEditPlanner.ts`

The helpers are pure classifiers/projectors. They do not read files, write
files, call providers, call browsers, invoke patch engines, approve
permissions, discover files, or mutate workspace state.

## Current Supported Edit Boundary

Current supported write/edit behavior remains:

- write requires one explicit in-workspace target and concrete content
- edit requires one explicit in-workspace target plus concrete replacement,
  patch, or fenced target content under the current bounded route
- exact fenced replacement now has a current-supported narrow lane when the
  route has one explicit target, an exact old/new fenced mapping, exactly one
  matching region, workspace authority, final stale-read, and post-write
  verification; Route 168 makes this lane reachable through prompt/CLI
  runtime selection while still delegating execution to Edit / Patch; Route 169
  closes out the activated lane with stable success/stopped/failed outcome
  markers, Result Surface classification, continuation-safe evidence, and
  verifier coverage without adding edit power; Route 170 adds a single-file
  pre-write snapshot/recovery substrate for the activated lane; Route 171 adds
  a no-write discovery candidate manifest and explicit confirmation model, with
  handoff only when exactly one confirmed candidate reduces to this existing
  exact fenced replacement lane; Route 172 opens a bounded confirmed
  target-set execution lane for exact fenced replacement only, with max 3
  files, preflight-all-before-mutation, per-file workspace authority,
  final stale-read, pre-write snapshot, post-write verification, partial
  failure evidence, and rollback readiness without automatic rollback; Route
  173 makes snapshot-backed recovery operational only through explicit
  rollback apply, with recovery plans from known snapshot ids, single-file and
  bounded target-set subset restore, current-content guards, post-rollback
  verification, and replay-safe result/session evidence; Route 174 adds a
  transaction id, safe execution journal, explicit preflight atomicity policy,
  verification aggregation, partial-failure separation, and recovery workflow
  handoff for confirmed target sets without claiming true atomic rollback
- generated edit proposals are current-supported only as no-write proposal
  manifests and review/confirmation projections; provider-backed proposal
  generation may participate only through an explicit opt-in provider boundary
  that consumes redacted, budgeted file context, and provider output remains a
  proposal manifest with `mutationAuthority: not-granted`; proposals can hand
  off only after they reduce to explicit old/new mapping plus explicit
  single-target or bounded target-set confirmation, and that handoff reuses the
  existing exact fenced replacement or target-set exact fenced lanes
- ambiguous sibling targets stop before mutation
- vague generated-content prompts produce a reviewable no-write generated
  proposal when safe, or stop actionably when content, target, mapping, or
  confirmation is missing
- no-write read/inspect requests stay separate from mutation
- workspace authority, final stale-read, and post-write verification remain
  execution-route preconditions owned by the bounded write/edit routes

Still unsupported in the current route:

- broad refactor execution
- batch or broad multi-file edit execution
- discovery edit execution, except Route 171's no-write candidate manifest,
  confirmed single-target handoff into the existing exact fenced replacement
  lane, and Route 172's confirmed target-set exact fenced replacement lane
- broad/fuzzy fenced replacement execution; only exact old/new fenced mapping
  is supported
- direct generated file content mutation from vague prompts
- rollback or snapshot execution except explicit snapshot-backed recovery apply
  from Route 173

## Reference Scan

The reference scan was shape-only; no implementation code was copied.

- opencode separates write/edit tool schemas from permission asks and carries
  edit diffs through permission metadata before writing.
- Claude Code file tools require structured file path/content or
  old/new-string inputs, check write permission, and protect against stale
  file state before overwriting.
- Gemini CLI models write/edit as modifiable tools with confirmation details,
  locations, policy update options, and explicit replacement parameters; its
  broader fuzzy recovery is not adopted here.
- Inspect AI's text editor tool separates view/create/str_replace/insert/undo
  commands and shows that rollback is a separate operation with its own
  history requirement, not an implicit side effect of planning.

## Future Modes

| Mode | Status now | Required before execution |
|---|---|---|
| broad refactor planning | future-only | target/constraint manifest, user-confirmed target selection, workspace authority, final stale-read, verification plan, snapshot/rollback story |
| multi-file discovery edit | current-supported only for confirmed target sets that reduce to exact fenced replacement, max 3 files | discovery phase, bounded candidate file list, explicit target-set confirmation, exact old/new fenced mapping for every target, preflight-all-before-mutation, transaction id, safe journal, per-file workspace authority, final stale-read, snapshot receipt, post-write verification aggregation, partial-failure changed/failed/unattempted separation, recovery workflow handoff, rollback readiness, and explicit snapshot-backed subset recovery apply; no fuzzy/generated/broad execution, no automatic rollback, no atomic rollback claim |
| generated edit proposal | current-supported only as no-write proposal and explicit review/confirmation lifecycle | proposal manifest with `mutationAuthority: not-granted`, safe summary, raw-content-excluded evidence, explicit old/new mapping, explicit confirmation, then handoff through existing fenced or target-set exact lanes; provider-backed proposal generation is allowed only behind explicit provider availability with redacted/budgeted context and fake-provider deterministic tests; no default real-provider calls, no autonomous generation apply loop, no mutation from proposal alone |
| confirmed single-target discovery edit | current-supported only when it reduces to exact fenced replacement | one confirmed candidate from the manifest, exact old/new fenced mapping, workspace authority through existing write route, final stale-read, pre-write snapshot receipt, post-write verification |
| fenced replacement | current-supported and runtime-reachable only for exact old/new fenced mapping; broad/fuzzy/discovery/generated/multi-file rollback remains stopped and no-write, while explicit snapshot-backed single-file rollback apply is current-supported | explicit target file, exact old/new fenced block mapping, exactly one match, ambiguity handling, workspace authority, final stale-read, pre-write snapshot receipt, verification plan, stable outcome taxonomy, rollback readiness projection, explicit snapshot id and target for rollback apply |

These modes are intentionally separate. A broad refactor request is not a
discovery edit. A discovery edit is not permission to mutate every candidate.
A fenced replacement is not fuzzy broad replacement unless a later route
explicitly owns that behavior.

## Target And Constraint Manifest

Future execution routes must create a manifest before mutation:

- requested mode
- requested scope
- candidate target list or exact target path
- user constraints and non-goals
- planned per-file operation kind
- stale-read evidence requirement
- workspace authority requirement
- verification command or evidence requirement
- cleanup/redaction requirement
- rollback or snapshot requirement when broad scope is involved
- for the activated exact fenced replacement lane, the current substrate is a
  single-file pre-write snapshot receipt plus explicit-only rollback plan/apply
  seam; it does not grant broad, fuzzy, discovery, generated, multi-file, or
  automatic rollback behavior

The manifest is not write authorization. It becomes actionable only after the
user confirms the target set and the execution route re-checks authority and
stale-read state.

Route 171 discovery manifests are explicitly no-write. They carry
`mutationAuthority: not-granted`, bounded candidate path labels, match evidence
summaries, confidence, required confirmation, planned operation kind,
snapshot/verification requirements, and raw-content-excluded redaction status.
Only `confirmed-single-target` may hand off, and only to the existing exact
fenced replacement route. Route 172 additionally allows
`confirmed-target-set` handoff only to the bounded target-set exact fenced
replacement route. The manifest still does not grant mutation authority; the
execution route must re-check every target before any mutation.

Route 173 recovery plans are also not mutation authority. They require explicit
snapshot id and target facts, workspace authority, current-content guard
preflight, direct rollback confirmation, and post-rollback verification before
reporting restored files.

Route 174 target-set transactions are audit evidence, not write authority.
The transaction journal records only safe step/status/reason/evidence facts and
excludes raw old/new blocks or file content. Preflight atomicity means every
target is checked before the first mutation; it is not a claim that later writes
are atomically rolled back.

Route 175 generated edit proposal manifests are also not mutation authority.
They record proposal id, requested mode, target scope, target labels, proposed
content status, exact mapping status, confirmation status, mutation readiness,
verification/snapshot requirements, and `raw-content-excluded` evidence. A
reviewed proposal can execute only after it becomes an explicit old/new mapping
with explicit target confirmation, and execution remains owned by the existing
exact fenced replacement or bounded target-set route.

Route 176 provider-backed edit proposal manifests preserve the same boundary.
`providerEditContext.ts` builds a redacted, budgeted safe edit context packet;
`providerEditPlanner.ts` calls only an explicitly available provider boundary
or deterministic fake provider; `providerEditProposal.ts` normalizes output
into review-only, exact single-target, exact target-set, or unsupported states;
and `providerEditConfirmation.ts` / `providerEditResult.ts` keep review,
confirmation, Result Surface, Session / Continue, and verifier evidence
no-write until an existing exact lane performs its own authority, stale-read,
snapshot/recovery, and verification checks.

## User Confirmation Model

User confirmation must be explicit and scoped:

- broad refactor planning requires confirmation of the affected scope before
  mutation planning can execute
- multi-file discovery edit requires confirmation of the candidate target set
  before per-file mutation planning; confirmed execution is bounded to max 3
  exact fenced replacement targets
- fenced replacement requires confirmation of the exact target and mapping
  when the mapping is not already a current bounded edit input
- generated edit proposal review is not write authorization; confirmation must
  name exact target(s) and exact mapping before handoff

Prompt wording alone must not imply write authorization.

## Preconditions

Future write execution must satisfy these preconditions in the execution route,
not in the planning helper:

- workspace authority check for every target
- final stale-read check immediately before writer invocation
- no symlink or realpath boundary weakening
- concrete content or exact old/new mapping
- generated proposal reduced to explicit old/new mapping before handoff
- bounded candidate set and max-file guard for multi-file modes
- preflight every target before the first mutation in confirmed target-set mode
- post-write verification plan and result projection
- cleanup/redaction rules for result, transcript, report, and continue surfaces
- snapshot/rollback story before broad refactor execution is enabled

## Tool / Policy / Result Surface

Future-only edit requests currently project as Route 146 stopped receipts:

- availability: `available`
- policy: `blocked`
- execution: `not-run`
- result: `stopped`
- evidence includes `mutation:not-run`
- transcript-safe summaries exclude raw content and secrets
- do-next text tells the user which missing manifest, target, mapping, or
  confirmation is required

Current bounded write/edit requests still project as current-supported
classification only; execution remains owned by the existing bounded routes.

## Eval And Gate Plan

Future implementation routes should add gates in this order:

1. fenced replacement bounded implementation with exact mapping only: closed
   for exact old/new fenced mapping by Route 167 and activated through runtime
   selection by Route 168; Route 169 adds closeout taxonomy/verifier coverage;
   broad/fuzzy/discovery/generated/multi-file/rollback remains future-only
2. discovery edit candidate selection with user-confirmed target set
   - Route 171 closed no-write manifests and single-target handoff.
   - Route 172 opens bounded confirmed target-set exact fenced replacement
     execution only.
3. broad refactor manifest planning with no mutation
4. snapshot/rollback precondition route before any broad execution: Route 173
   closes explicit single-file and bounded target-set subset rollback apply for
   snapshot-backed edits only.

Each route must include focused helper tests, write-boundary tests,
stale-read/authority regressions, result-contract projection tests, and
closeout verification before package-level sweep.

## Preserved Boundaries

Route 147 did not enable provider calls, browser work, broad edit/refactor,
batch/discovery execution, broad/fuzzy fenced replacement, vague generated
content, workspace authority weakening, stale-read bypass, rollback execution,
schema changes, CLI redesign, dependency changes, or broad runMvp rewrites.

## Post-Route-149 Forward Pointer

Route 147 defined future edit contracts only. Route 148 gave those contracts an
Edit / Patch module facade, and Route 149 reset the roadmap so Edit / Patch is
not automatically the next route.

Future edit work must enter through the Edit / Patch module, satisfy explicit
manifest/precondition/result boundaries, and remain no-write until a dedicated
execution route opens a narrow supported lane.
