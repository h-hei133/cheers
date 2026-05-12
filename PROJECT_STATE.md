# PROJECT_STATE.md

## 1. Current Stage Positioning

- Project name: private-coding-agents
- Current stage mainline: **active product hardening** on default CLI path
- Stage objective: make the interactive shell feel production-grade while preserving load-bearing runtime semantics
- Current focus: default CLI truthfulness / continuity, writer-started
  stopped-session continuity, non-write stopped `/continue` replay evidence,
  MCP visibility / execution / rejection consistency, tool lifecycle
  projection, stopped-session continuity projection, selected-workspace
  cross-process resume evidence, CLI entry parity, and isolated
  real-provider readiness smoke gating, release-core durability/MCP hard gates,
  and deterministic release meta-gate layering are stage-sealed; next
  implementation should be chosen from current main-path blockers instead of
  extending the same continuity proof family without a new regression.

What this stage is **not**:

- not a broad platform rewrite
- not a provider expansion campaign
- not a long-term memory project

## 2. Repository and Reference Boundaries

- Read-only reference repo:
  - `/home/wang/projects/source-claudecode`
- Writable working repo:
  - `/home/wang/projects/coding-agents`
- Secondary reference for UX/provider patterns:
  - `/home/wang/projects/opencode`

Boundary rules:

- recover load-bearing runtime truth from Claude Code snapshot when needed
- absorb practical CLI/product behavior from opencode where it improves real usage
- only modify and validate code in the private repo
- keep TS/Rust/contracts boundaries intact

## 3. Architectural Position (unchanged)

### TypeScript = control plane

Includes:

- shell / interactive CLI
- session lifecycle and continuity
- orchestration and query loop semantics
- slash routing / shell actions
- recovery and permission UX
- MCP capability routing
- terminal rendering contract and output boundary

### Rust = execution plane

Includes:

- daemon execution backend
- command execution / timeout / cancel
- sandbox preflight
- execution responsibility only

### contracts = cross-runtime semantic boundary

- protocol, lifecycle, and payload compatibility across runtimes

## 4. Current Product Mainline

The primary user-visible mainline is now:

1. User submits prompt in default CLI
2. Prompt resolves through shared turn execution backbone
3. Query loop runs with continuity and permission semantics
4. User sees answer-first terminal output
5. Result block stays minimal and actionable in compact mode
6. Session remains ready for next turn with clear boundaries

## 5. Latest Implemented Delta (through 2026-05-12)

### Current release-claims audit after Routes 01-08

The current release/readiness claim is deliberately bounded: the project is
limited dogfood ready and deterministic release-candidate green for the current
verified surface. It is not broad/general release ready.

### Route 10 evaluation: 3-file planning no-write

Route 10 is documentation-only evaluation in
`docs/design/three-file-planning-no-write-evaluation.md`. Recommendation: an
exactly-three selected-workspace existing-file `Update File` planning/no-write
surface is a reasonable next bounded prerequisite, but only if it remains
stopped/no-write with `changedFiles=[]`, no writer reachability, no default gate
change, no real-provider requirement, and no 3-file/broad mutation readiness
claim.

Allowed claims after the Route 01-08 sweep:

- deterministic release-candidate gate is green for the bounded local surface
- candidate mutation has synthetic green evidence
- opt-in real candidate mutation happy paths passed for selected-workspace
  single-file update, single-file create, and exactly-two-file update
- deterministic candidate mutation failure taxonomy covers config,
  network/auth, model-output, route, post-write, unsupported,
  product-regression, and unknown classes
- deterministic CLI/user-entry two-file evidence exists
- unsupported real-model-like patch outputs are stopped/error, not success
- session durability long evidence exists for synthetic auto-compact, reload,
  `/continue`, mutation success, and partial failure continuity
- local deterministic MCP execution and MCP error taxonomy have evidence
- live TTY limited dogfood checklist exists as manual-only validation guidance
- mutation routing projection and compact continuity summary extraction reduced
  localized architecture risk without expanding capability

Forbidden claims remain explicit:

- no broad/general release readiness
- no arbitrary project mutation readiness
- no broad `apply_patch`, 3+ file writes, delete/move, rollback, or atomic
  multi-file recovery readiness
- no external/user-configured MCP, remote MCP, or MCP ecosystem readiness
- no real-provider default gate readiness or broad real-provider mutation
  readiness
- no true real-model unsupported patch coverage beyond deterministic
  real-model-like evidence
- no live TTY product readiness from the manual checklist alone
- no Claude Code or opencode maturity/parity claim

Route 09 did not change product behavior, default gates, mutation capability,
provider/MCP behavior, or release gate membership. It only synchronizes release
and readiness wording with the evidence already present after Routes 01-08.

### Route closeout index for Routes 01-08 release-claims sweep

This index is specific to the Route 01-08 claim audit sequence.

| # | Route | Closeout |
| ---: | --- | --- |
| 1 | Opt-in real candidate mutation happy path | Done; selected-workspace single-file update, single-file create, and exactly-two-file update passed only through explicit real-provider opt-in. |
| 2 | Candidate mutation failure taxonomy | Done; unsupported/post-write and other failure classes are classified as stopped/failure, not success. |
| 3 | Deterministic CLI/user-entry two-file evidence | Done; exactly-two-file selected-workspace update is covered through the CLI `--print` path. |
| 4 | Mutation routing projection extraction | Done; routing projection risk was reduced without changing mutation capability. |
| 5 | Compact continuity summary builder extraction | Done; compact summary construction risk was reduced without changing session capability claims. |
| 6 | MCP error taxonomy | Done; local/error taxonomy improved while external/user-configured MCP readiness remains unclaimed. |
| 7 | Live TTY limited dogfood checklist | Done; manual-only checklist exists and is not a default gate. |
| 8 | Unsupported patch E2E verifier | Done; deterministic real-model-like unsupported output shapes stop/error with no writes and no success claim. |

### Route closeout index for the current release-readiness sweep

This is a compact index for the 15-route sweep; detailed evidence remains in
the route-specific sections below and in the cited commits.

| # | Route | Closeout |
| ---: | --- | --- |
| 1 | `verify-real-user-capabilities` tier split | Done in `ee74ad5`; default MVP remains synthetic selected-workspace single-file existing Update File. |
| 2 | Selected-workspace single-update real smoke | Done in `b74a035`; explicit opt-in real-provider smoke only. |
| 3 | `verify:cli-entry` stopped follow-up | Done in `27ba173` and parity blocker closed in `e03acbd`. |
| 4 | `real-small-bugfix-followup-verify` as MVP dogfood | Replaced instead of promoting the legacy case; MVP dogfood is the narrow synthetic selected-workspace single-update gate from route 1. |
| 5 | Protected/create case retier | Done in `c08099c`, then bounded create moved to candidate route in `09c6dcd` / `2318f10` / `efb336d`. |
| 6 | `verify:provider-readiness:real` env contract | Done in `29d177f`; default path skips without loading real provider config. |
| 7 | `verify:release:core` permission-memory gate | Done in `c8b7141`. |
| 8 | Mutation route failure projection to result/session | Done in `4776036` and later candidate partial-failure smokes. |
| 9 | Mutation verification submodule extraction | Done in `4776036`. |
| 10 | Real provider single-file opt-in smoke | Done in `b74a035`; remains explicit opt-in. |
| 11 | Add/create file assessment | Completed as candidate synthetic and real smokes in `09c6dcd`, `2318f10`, and `efb336d`. |
| 12 | Multi-file assessment | Completed as exactly-two candidate route/smokes in `2c5981b`, `cb4337c`, `2e559a3`, `9efd45c`, `59f9169`, and `0ed6c53`. |
| 13 | Compact / long-session assessment | Completed and wired into release-core in `d77d5d8` and `90118ab`. |
| 14 | MCP real-execution assessment | Completed as local deterministic MCP execution evidence in `de63e2e`, then wired into release-core in `b657922`; external/user-configured MCP remains out of scope. |
| 15 | Release gate defaultization | Completed in `4167156` with `verify:release:deterministic`; real provider gates remain opt-in. |

### Current closeout: deterministic release meta gate

`verify:release:deterministic` is now the default deterministic release
closeout meta gate. It aggregates the local release-candidate evidence without
touching the real provider or changing the narrower `verify:release:core`
contract.

Included hard sub-gates:

- `build -w packages/ts-shell`
- full `src/cli-baseline.test.ts`
- `verify:release:core`
- `verify:real-user-capabilities -- --tier=mvp`
- `verify:real-user-capabilities -- --suite=candidate-mutation`
- `verify:real-user-capabilities -- --suite=candidate-mutation --include-real
  --dry-run`
- `verify:provider-readiness:real` default skip/pass
- `verify:provider-readiness:real -- --classification-self-test`

Readiness status:

- if this meta gate passes, the project may claim deterministic
  release-candidate readiness for the current bounded surface
- limited dogfood readiness and opt-in synthetic candidate mutation dogfood
  remain green claims
- broad/general release readiness is still not claimed

Important boundaries:

- the meta gate clears real-provider opt-in env before child gates and must
  report `realProviderTouched=false`
- real-provider candidate mutation remains explicit opt-in through
  `verify:real-user-capabilities:candidate-mutation:real`
- this does not add rollback, atomicity, 3+ file support, delete/move support,
  broad `apply_patch`, arbitrary mutation, external/user-configured MCP proof,
  provider/auth changes, or default real-provider gates

### Current closeout: unsupported patch real-model-like E2E verifier

`verify:real-user-capabilities:unsupported-patch-e2e` is a deterministic,
non-default verifier for real-model-like unsupported mutation outputs. It does
not run a real provider and does not add unsupported mutation capability.

Covered scenarios:

- unsupported three-file update
- unsupported delete file
- unsupported move file
- unsupported broad apply_patch
- malformed patch output
- mixed supported plus unsupported patch

Key boundaries:

- each scenario must stop/error without writing files
- `changedFiles=none`, `successLike=false`, and `rollbackClaimed=false` remain
  required evidence markers
- malformed output is classified as model-output; unsupported shapes are
  classified as unsupported
- this is deterministic real-model-like evidence, not true real-provider
  unsupported patch coverage
- broad `apply_patch`, 3+ files, delete/move, rollback, atomicity, arbitrary
  mutation, real-provider defaults, and default release gate membership remain
  unchanged

### Current closeout: local MCP execution release-core gate

MCP local execution now has a deterministic standalone gate and is also wired
into `verify:release:core` as a hard sub-gate immediately after
`verify:mcp-routing`.

Key sealed evidence:

- `verify:mcp:local-execution` uses only the local stdio fixture
  `src/core/mcp/fixtures/mockMcpServer.mjs`
- the success path crosses `CoreMcpGateway` list/invoke, `ToolRuntime`
  registry execution, tool provenance, lifecycle projection, focused
  shell-session user-visible result rendering, and session continuity
- success keeps `executionPath=mcp-stdio`, server/tool identity, and
  `changedFiles=[]` / `failedFiles=[]`
- failure coverage includes MCP `isError`, stdio execution throw, stale or
  unavailable descriptor handling, and unknown MCP tool execution without
  success-like projection
- follow-up continuity keeps MCP tool provenance and failure boundary without
  fabricating file mutation state

Important boundaries:

- the standalone `verify:mcp:local-execution` command remains available
- the release-core sub-gate emits `gate name=mcp-local-execution`,
  `mode=synthetic`, `realProviderTouched=false`,
  `externalMcpServerUsed=false`, `userMcpConfigUsed=false`, the local stdio
  fixture path, and `releaseCoreWired=true`
- the user-visible surface proof is focused shell runtime/session evidence, not
  full CLI-entry MCP tool execution proof
- this is not external MCP proof, user-configured MCP proof, arbitrary MCP
  ecosystem readiness, or broad/general release readiness
- it does not read user MCP config, start an external MCP server, touch a real
  provider, alter provider/auth, change mutation routes, or change the default
  MVP gate

### Current closeout: synthetic long-session compact/reload `/continue` durability gate

Long-session durability now has a deterministic synthetic gate outside the
default MVP stack and wired into `verify:release:core` as its final hard
sub-gate.

Key sealed evidence:

- `verify:session-durability:long` runs a focused synthetic long-session gate
  without provider access
- the gate triggers the actual `SessionManager` auto-compact threshold through
  twelve persisted `query.completed` turns instead of hand-setting compacted
  state
- success path: exactly-two-file mutation success survives auto-compact,
  process reload, `/continue` focused continuation, an unrelated post-compact
  non-mutation turn, and a second `/continue`; `changedFiles=[src/a.ts,
  src/b.ts]`, verified files, `failedFiles=[]`, and success handoff remain
  visible
- partial-failure path: exactly-two-file partial mutation failure survives
  auto-compact, process reload, stopped `/continue` guidance, an unrelated
  post-compact non-mutation turn, and a second `/continue`; stopped state,
  `BlockerKind=partial-mutation-failed`, `changedFiles=[src/a.ts]`,
  `failedFiles=[src/b.ts]`, writer-started unknown write effect,
  inspect/re-read next action, and no-rollback/no-atomicity wording remain
  visible
- the gate uses child processes around seed/reload/continue steps to prove a
  CLI-process-boundary equivalent, while staying synthetic and deterministic
- `verify:release:core` now executes `session-durability-long` at the end of
  its deterministic hard-gate sequence, and the standalone
  `verify:session-durability:long` command remains available

Readiness status:

- limited dogfood readiness remains green
- this is stronger release-durability evidence than the earlier
  compact-equivalent mutation continuity smoke
- release-core durability coverage is stronger because actual auto-compact,
  reload, `/continue`, success, partial failure, and post-compact unrelated
  turn continuity are now part of the hard gate
- broad/general release is still not claimed because this does not prove real
  provider long sessions, live TTY behavior, arbitrary project mutation,
  rollback, 3+ files, delete/move, or broad `apply_patch`

Important boundaries:

- the gate remains independently runnable via `verify:session-durability:long`
- it is not part of default MVP; it is now part of `verify:release:core`
- no mutation writer/route capability, provider/auth flow, CLI/session schema,
  rollback, atomicity, 3+ file support, delete/move support, or broad
  `apply_patch` support is added

### Current closeout: release-readiness gate sweep after stopped `/continue` parity

The full CLI baseline stopped `/continue` parity blocker is closed.

Recent closeout commit:

- `e03acbd Fix stopped continue CLI parity`

Key sealed evidence:

- full `src/cli-baseline.test.ts` passes with 54/54 tests after the stopped
  `/continue` parity fix
- stopped `/continue` guidance restores the `Continuation` marker on the
  user-visible stopped-session follow-up surface
- failure handoff details remain intact instead of being truncated away from
  recovery guidance; changed files, failed files, inspect/re-read next action,
  and no-rollback/no-atomicity wording remain visible for partial mutation
  recovery
- `verify:cli-entry`, `verify:release:core`, `verify:real-user-capabilities --
  --tier=mvp`, `verify:real-user-capabilities -- --suite=candidate-mutation`,
  `verify:mutation-recovery:followup`, `verify:mutation-continuity:compact`,
  `verify:result-contract`, and `build -w packages/ts-shell` are green in the
  closeout sweep
- `verify:real-user-capabilities -- --suite=candidate-mutation --include-real
  --dry-run` lists the opt-in real-provider candidate mutation cases without
  touching the provider
- `verify:provider-readiness:real` remains default skip/pass without reading
  real provider configuration, and `verify:provider-readiness:real --
  --classification-self-test` passes locally

Readiness status:

- limited dogfood readiness is green for the current deterministic gate stack
- candidate mutation dogfood is green for the explicit synthetic opt-in suite
- real-provider candidate mutation remains explicit opt-in evidence, not a
  default gate
- release-readiness prerequisites are mostly green, but broad/general release
  is not claimed

Important boundaries:

- MVP remains selected-workspace, single-file, existing `Update File` through
  the synthetic gate
- candidate Add File create and exactly-two-file Update File write remain
  candidate-only and do not become MVP/default behavior
- compact-equivalent mutation continuity is not full long-session release proof;
  `verify:session-durability:long` now provides synthetic process-boundary
  long-session evidence inside `verify:release:core`, but broad/general release
  durability is still not claimed
- no rollback, atomic multi-file transaction, 3+ files, delete/move, broad
  `apply_patch`, arbitrary project mutation, provider/auth changes, CLI/session
  schema changes, or default real-provider gate are added

### Current closeout: narrow Add File candidate create route

Selected-workspace `*** Add File` now has a synthetic candidate write route for
one new file under explicit runtime and workspace-write approval.

Key boundaries:

- the route accepts exactly one Add File operation and rejects update, delete,
  move, mixed, and multi-file patches
- the target must be inside the selected workspace, the parent directory must
  already exist, and the target must not exist
- the writer uses exclusive create semantics, does not create parent
  directories, and performs post-write readback verification before reporting
  `changedFiles=[target]`
- blocked paths keep `changedFiles=[]`, `writeIntents=[]`, no success terminal,
  and no writer invocation unless the failure happened after the exclusive
  writer started
- `verify-real-user-capabilities` includes an executable synthetic candidate
  smoke, `synthetic-selected-workspace-single-file-create`, which proves the
  explicit selected-workspace create route creates one file and reports
  `changedFiles=[target]` only after readback verification
- `verify-real-user-capabilities` also exposes an explicit opt-in real-provider
  candidate smoke, `real-selected-workspace-single-file-create`, which asks the
  provider for exactly one `Add File` patch and then routes only that patch
  through the same isolated selected-workspace create entrypoint
- default MVP remains selected-workspace existing-file single-file update; broad
  `apply_patch`, delete/move, multi-file, rollback, provider/auth, and
  default real-provider create execution remain unchanged

### Current closeout: multi-file Update File candidate write route

Selected-workspace multi-file `*** Update File` now has a synthetic candidate
write route for exactly two existing files, plus the earlier no-write
planning/preflight classification.

Key boundaries:

- the write route accepts exactly two Update File operations and rejects add,
  delete, move, mixed, duplicate-target, and 3+ file patches
- both targets must resolve inside the selected workspace, be existing regular
  files, pass update verification, and pass final freshness checks before the
  first writer call
- writing is sequential after explicit approval for exactly the two listed
  files; no rollback or atomic transaction is claimed
- per-file post-write readback verification controls `changedFiles`; partial
  failure stops instead of success, keeps only verified files in `changedFiles`,
  and reports the failed file in `failedFiles`
- approval denied, missing targets, workspace-boundary violations,
  hunk/context mismatches, and final stale-read failures stay no-write with
  `changedFiles=[]`
- `verify-real-user-capabilities` includes an executable synthetic candidate
  smoke, `synthetic-selected-workspace-multi-file-update-planning`, that remains
  a no-write planning smoke
- `verify-real-user-capabilities` also includes
  `synthetic-selected-workspace-two-file-update`, an executable synthetic
  candidate smoke that routes exactly two existing-file Update File operations
  through the explicit selected-workspace write entrypoint and verifies both
  changed files
- `verify-real-user-capabilities` includes
  `synthetic-selected-workspace-two-file-update-partial-failure`, an executable
  synthetic candidate smoke that makes the second target unwritable to prove
  partial failure stays stopped, reports only the verified first file in
  `changedFiles`, reports the failed second file in `failedFiles`, and does not
  claim success, rollback, or atomicity
- `verify-real-user-capabilities` includes
  `synthetic-mutation-continuity-after-compact`, an executable synthetic
  candidate smoke that uses session persistence, auto-compact, reload, and
  follow-up continuity context as compact-equivalent evidence that two-file
  mutation success preserves `changedFiles=[src/a.ts, src/b.ts]` and two-file
  partial failure preserves stopped state, `changedFiles=[src/a.ts]`,
  `failedFiles=[src/b.ts]`, writer-started unknown write effect, and the
  inspect/re-read next action without success or rollback wording
- `verify-real-user-capabilities` includes
  `synthetic-two-file-partial-failure-recovery-followup`, an executable
  synthetic candidate smoke that proves stopped `/continue` recovery guidance
  re-surfaces the partial mutation state: prior run not success,
  `changedFiles=[src/a.ts]`, `failedFiles=[src/b.ts]`, writer-started unknown
  write effect, inspect/re-read next action, and explicit no-rollback/no-atomic
  wording
- `verify-real-user-capabilities` exposes an explicit opt-in real-provider
  candidate smoke, `real-selected-workspace-two-file-update`, which asks the
  provider for exactly one patch block with exactly two Update File operations
  and routes only that patch through the isolated selected-workspace two-file
  update entrypoint
- broader apply_patch, add/delete/move, 3+ files, rollback, provider/auth,
  CLI/session schema, real-provider smokes, full release long-session proof, and
  default gates remain unchanged

### Current closeout: mutation verification handoff projection

Selected-workspace mutation verification and failure handoff now has a focused
pure projection helper under `patchResult`.

Key boundaries:

- `mutationVerificationProjection.ts` classifies verified writes,
  verification-blocked/failed, protected-file changes, stale-read blockers,
  post-write verification failure, writer-started unknown/unverified effects,
  unsupported patch shapes, and no-mutation outcomes
- the helper only projects handoff kind, reason, next action, changed files,
  failed files, task verdict/reasons, patch failure code, blocker kind, and
  inspection evidence; it does not read, write, call providers, invoke tools, or
  change session schema
- `runMvpIntegratedFlow.ts` now delegates mutation task verdict/reason
  projection to the helper, while leaving the query loop, provider flow, tool
  dispatch, writer path, and mutation execution order unchanged
- `workspaceWriteResult.ts` now uses the same helper for selected-workspace
  write success and stopped failure surfaces, preserving `changedFiles=[]` for
  blocked/writer-started cases and preserving inspection-required handoff for
  unknown/unverified write effects
- create/add/delete/move, multi-file, rollback, broader `apply_patch`,
  provider/auth flow, real-user gate tiering, and CLI interaction behavior are
  unchanged

### Current closeout: release-core permission-memory gate

`verify:release:core` no longer fails the permission-memory hard gate because
approval-memory reflection prompts now stay on the orchestrated continuity
route instead of falling through to lightweight chat.

Key boundaries:

- the fix is limited to query route classification for permission-memory
  reflection prompts such as "what did I just approve and why is it asking
  again"
- the prompt remains no-write chat, but it uses orchestration so the existing
  session continuity and approval-memory explanation surface are available
- permission approval/denial persistence semantics, session schema,
  provider/auth flow, real-provider smokes, apply_patch, mutation capability,
  and real-user capability gate tiering are unchanged

### Current closeout: real-provider readiness smoke env contract

`verify:provider-readiness:real` now has a stable opt-in environment contract
for isolated real-provider readiness checks.

Key boundaries:

- default `verify:provider-readiness:real` skips without touching the real
  provider unless `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1` is set
- `--classification-self-test` remains synthetic/local and does not read
  provider credentials or contact a provider
- opt-in smoke uses isolated `PRIVATE_AGENTS_TEST_ROOT`, `HOME`, and
  `USERPROFILE`; the child CLI always receives `PRIVATE_AGENTS_REAL_HOME=''`
- provider configuration comes only from explicit environment variables or
  the approved provider env file loaded silently at
  `/home/wang/.private-agents-real/provider.env`
- the smoke does not read real user provider config directories
- failure attribution stays specific: missing config, missing key, auth,
  network, unsupported, unknown, or product regression

Important boundaries:

- production provider/auth flow is unchanged
- default CLI baseline, real-user capability gates, apply_patch/mutation,
  session schema, and CLI interaction semantics are unchanged
- provider secrets and provider env values must not be printed, copied,
  logged, or summarized

### Current closeout: Add File no-write classification

The apply_patch dry-run/readiness path now recognizes `*** Add File` patches as
create/add candidate/backlog evidence without creating files or entering the
selected workspace writer in default/no-write paths.

Key boundaries:

- Add File classification is synthetic/no-write only and remains outside the
  default MVP gate
- classified Add File results keep `willWrite=false`, `changedFiles=[]`,
  `writeIntents=[]`, and no writer-reachable success claim
- classified blockers distinguish unsupported add, existing-target collision,
  missing parent directory, outside-workspace target, and multi-file add
- default MVP remains selected-workspace existing-file single-file update only
- the separate synthetic candidate create route can create one selected-workspace
  file only after explicit runtime/write approval and readback verification
- broader apply_patch, default create/add writing, delete/move, multi-file,
  rollback, provider/auth, CLI/session schema, and production mutation flow are
  unchanged

### Current closeout: real-user capability gate tiering

The `verify-real-user-capabilities` gate is now tiered so the default MVP
capability check validates the current dogfood mutation boundary without being
blocked by broader future edit expectations.

Current tier split:

- default `verify:real-user-capabilities` runs `--tier=mvp`
- MVP validates an existing-file, single-file, selected-workspace update through
  the explicit workspace write entrypoint
- candidate tier keeps real-provider bugfix/follow-up, protected consistency,
  and richer selected-workspace smoke evidence explicit
- candidate mutation smokes are also available as an explicit dogfood suite via
  `verify:real-user-capabilities:candidate-mutation`; it runs the closed
  synthetic mutation cases by default and lists real-provider mutation smokes as
  opt-in unless `--include-real` or the dedicated `:real` script is used
- `verify:real-user-capabilities:candidate-mutation:real` silently loads the
  approved provider env file, derives an isolated runtime config home under
  `PRIVATE_AGENTS_TEST_ROOT`, and uses `PRIVATE_AGENTS_REAL_HOME` only for that
  generated config source; default suite and dry-run modes still do not touch
  the real provider
- openai-compatible provider.env shapes, including SiliconFlow-style
  `providerCredentials.openai-compatible.*`, remain provider id
  `openai-compatible`; smoke diagnostics distinguish provider identity from the
  OpenAI-compatible protocol and print only the base URL host
- the candidate real suite refuses ambient `openai` fallback; in the current
  SiliconFlow-compatible env shape it keeps the opt-in smoke on
  `openai-compatible` with host-only base URL diagnostics
- release tier records release-only gates such as CLI entry stability,
  permission-memory, release-core, and long-session/compact continuity as
  non-MVP blockers
- candidate tier now also records exactly two-file Update File no-write
  planning/preflight classification
- backlog tier retains create/add outside the explicit candidate route,
  delete/move, multi-file writing, rollback, fuzzy/AST, broad `apply_patch`,
  and arbitrary mutation expectations outside MVP

Important boundaries:

- create/add file, multi-file, and protected composite cases are retained but no
  longer block MVP
- broader `apply_patch` support is not opened
- production provider/auth flow and production mutation paths are unchanged
- real-provider checks remain explicit and must use isolated runtime/test homes;
  provider secrets must not be printed or persisted

Follow-up opt-in evidence:

- `verify-real-user-capabilities` now also exposes
  `--case=real-selected-workspace-single-file-update` and
  `verify:real-user-capabilities:real-single-file`
- this candidate smoke uses a real provider only after explicit opt-in, then
  routes exactly one provider-produced `Update File: src/app.ts` patch through
  the explicit selected-workspace workspace-write entrypoint against an
  isolated temporary fixture
- the fixture contains only one existing target file; post-write verification
  requires that `src/app.ts` changed from `draft` to `ready` and that no files
  were added, removed, or otherwise changed
- the case is metadata-visible in `--list` and `--tier=candidate --dry-run`,
  but it is not part of the default MVP gate and does not run under
  `--tier=mvp`
- this evidence does not open broader `apply_patch`, create/add,
  delete/move, multi-file, rollback, protected composite, provider/auth, or
  production mutation behavior

Additional opt-in create evidence:

- `verify-real-user-capabilities` now also exposes
  `--case=real-selected-workspace-single-file-create` and
  `verify:real-user-capabilities:real-create`
- this candidate smoke uses a real provider only after explicit opt-in, then
  accepts exactly one provider-produced `Add File: src/new-note.txt` patch for
  an isolated selected workspace where `src/` already exists and the target is
  missing
- the smoke rejects missing/multiple patch blocks, generated `Update File`
  patches, wrong target paths, deterministic content mismatches, mixed
  operation shapes, route rejection, no mutation, and post-write verification
  failures as distinct outcomes
- success requires that only `src/new-note.txt` is created and that
  `changedFiles=[src/new-note.txt]` is reported only after readback
  verification
- this evidence does not open default create/add writing, broader
  `apply_patch`, parent directory creation, delete/move, multi-file, rollback,
  protected composite, provider/auth, or default MVP behavior

### Current closeout: isolated opt-in real-provider readiness smoke

A new real-provider readiness smoke gate is available as an explicit opt-in
command and remains outside default test/build/CLI baseline paths.

Recent closeout commit:

- `de2576c Add isolated real-provider readiness smoke gate`

Key sealed evidence:

- `verify:provider-readiness:real` defaults to a skip/refusal path unless
  `PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1` is set
- the smoke uses explicit provider env and an isolated
  `PRIVATE_AGENTS_TEST_ROOT` runtime home, then forces child CLI `HOME` and
  `USERPROFILE` to that isolated home
- the smoke refuses `PRIVATE_AGENTS_REAL_HOME` instead of reading real user
  provider configuration from `/home/wang/.private-agents-real`
- readiness outcomes are classified as missing-key, missing-config, auth,
  network, unsupported, unknown, pass, or product-regression instead of
  collapsing 401/403 or `invalid_api_key` into a generic failure
- classification and redaction self-tests can run without opt-in and without
  touching a real provider

Important boundaries:

- default `src/cli-baseline.test.ts`, build, result-contract verification, and
  provider readiness unit tests do not run the real-provider smoke
- this does not change production provider/auth flow, browser login,
  credential discovery, CLI interaction model, session schema, apply_patch,
  mutation flow, or real-provider home handling
- the actual real-provider smoke remains manual and credentialed; a missing
  opt-in or missing credential is a clear skip/config result, not a default
  test failure

Validation recorded for the closeout:

- `rtk npm run verify:provider-readiness:real`
- `rtk npm run verify:provider-readiness:real -- --classification-self-test`
- opt-in localhost-unreachable classification check exited with expected
  network classification
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

### Current closeout: CLI stdin / print / interactive entry parity

The CLI three-entry baseline route is stage-sealed on `main`.

Recent closeout commit:

- `22383f8 Add CLI entry parity baseline`

Key sealed evidence:

- `stdin`, `--print`, and pipe-spawn interactive paths now share focused
  parity baseline coverage for read-only prompt handling, `/sessions current`,
  provider-readiness missing-key surface, stopped `/continue`, and MCP
  unavailable surface
- the stdin harness exercises the real CLI entrypoint through child-process
  stdin instead of internal runtime helpers
- the interactive pipe-spawn wait marker now matches only output produced after
  test input is sent, reducing false positives from startup text
- entry-specific assertions preserve stopped/error/success truthfulness and do
  not allow `changedFiles` / `failedFiles` to vary by input transport

Important boundaries:

- this route only changes CLI baseline tests and the test harness
- it does not change provider implementation, session schema, runtime flow,
  MCP discovery, mutation flow, apply_patch capabilities, real-provider gates,
  or the broader CLI interaction model
- full `src/cli-baseline.test.ts` is hermetic after the provider-readiness
  isolation follow-up

### Current closeout: selected-workspace write cross-process resume evidence

The selected-workspace writer-started resume fixture route is stage-sealed on
`main`.

Recent closeout commit:

- `9459180 Add cross-process resume coverage for selected workspace writes`

Key sealed evidence:

- a first process runs the selected-workspace write route and writes a stopped
  session with `writerStarted=true` and `writeEffect=unknown|unverified`
- a second CLI `/continue <prompt>` process reloads the same persisted session
  and follows continuity-only resume instead of treating the previous turn as
  success
- resumed output preserves target, writer-started state, write effect,
  `requiresUserInspection`, and next action while keeping `changedFiles=[]`
  and avoiding fake file-level `failedFiles`
- `continueShellActionRuntime` now allows explicit `/continue <prompt>` on an
  actionable stopped session to proceed through continuity-only follow-up;
  ordinary guidance, completed sessions, and non-actionable stopped/error
  sessions remain guarded by their existing paths

Important boundaries:

- this is evidence and a narrow `/continue <prompt>` stopped-session fix, not a
  new write capability
- it does not change apply_patch support scope, session schema,
  compact/replay, provider behavior, MCP discovery, mutation flow, or CLI
  interaction model

### Current closeout: stopped-session continuity projection

The stopped-session recovery surface extraction is stage-sealed on `main`.

Recent closeout commit:

- `61cf822 Extract stopped-session continuity projection`

Key sealed evidence:

- `stoppedSessionContinuity.ts` owns the pure projection from existing stopped
  results, failure reasons, tool lifecycle projection, and mutation metadata to
  continuity payload
- `SessionManager.ts` now uses the focused projection for stopped/error
  continuity instead of carrying the local classification logic directly
- writer-started unknown/unverified, approval denied, stale-read, MCP
  unavailable, tool execution failed, and generic stopped/error cases remain
  distinct and keep actionable reasons / next actions
- continuity preserves only real `changedFiles` / `failedFiles` metadata and
  does not invent write success, fake changed files, or verified write effects

Important boundaries:

- session persistence schema, compact/replay, CLI continue flow, provider
  behavior, success handoff, and mutation flow are unchanged
- this is a bounded extraction, not a session-system rewrite

### Current closeout: tool lifecycle projection

The tool lifecycle projection extraction is stage-sealed on `main`.

Recent closeout commit:

- `337edec Extract tool lifecycle projection`

Key sealed evidence:

- `toolLifecycleProjection.ts` provides a pure projection for existing tool
  result/provenance/approval signals into stable lifecycle kinds such as
  success, approval-denied, tool-unavailable, MCP unavailable,
  MCP execution failed, tool execution failed, permission-blocked, and
  environment-blocked
- `runMvpIntegratedFlow.ts` has narrow wiring through
  `dispatchToolWithLifecycle` and verification-failure classification while
  keeping the original fallback paths
- MCP `isError` / stdio throw and generic tool failures are not success-like;
  approval denied, permission blocked, unavailable, and execution failed
  remain separate semantics
- the projection does not execute tools, access providers, read/write files,
  mutate session state, handle UI, or fabricate `changedFiles` / `failedFiles`

Important boundaries:

- query loop ordering, provider flow, mutation flow, CLI behavior, session
  storage, default apply_patch behavior, and MCP discovery are unchanged
- this is a bounded extraction from `runMvpIntegratedFlow.ts`, not a broad
  orchestration refactor

### Current closeout: hermetic provider-readiness CLI baseline

The default `src/cli-baseline.test.ts` suite is no longer polluted by
real-provider-like OpenAI auth/readiness state.

Recent closeout commit:

- `ff20c76 Fix provider readiness CLI baseline isolation`
- `be6135f fix auth error`

Key sealed evidence:

- the four formerly fragile real-provider-like CLI chain tests now use an
  isolated local OpenAI-compatible HTTP fixture through fake-home provider
  config instead of `NODE_OPTIONS` / `globalThis.fetch` interception
- full `src/cli-baseline.test.ts` now passes by default without real OpenAI
  credentials, browser login state, `/home/wang/.private-agents-real`, or live
  network success
- deterministic readiness coverage remains in default tests for missing-key,
  auth-like 401/403, unsupported/missing config, network retry, and CLI
  readiness surface
- real-provider readiness remains an explicit opt-in gate through
  `verify:provider-readiness` / `verify:provider-baseline`, not part of default
  CLI baseline

Important boundaries:

- this does not change provider/auth production behavior, browser login,
  credential discovery, CLI interaction model, session schema, apply_patch,
  mutation flow, or real-provider gate behavior
- real-provider gate was not run because this route isolates default tests and
  does not claim real-provider readiness success

Validation recorded for the closeout:

- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/providerReadiness.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

### Current closeout: MCP visibility / execution / rejection consistency

The MCP focused gate is stage-sealed on `main`.

Recent closeout commit:

- `a024d11 Harden MCP tool failure provenance and continuity`

Key sealed evidence:

- MCP `isError` responses and MCP stdio execution throws no longer flow through
  a success result shape
- MCP unavailable/rejected/execution-failed outcomes retain provenance for
  execution path, server/tool, reason, and failure kind
- MCP unavailable is recognized as an actionable stopped blocker in
  `resultMapper`, `sessionRuntime`, and session continuity
- MCP unavailable/rejected/transport failure cases do not report
  `changedFiles` or fake file-level `failedFiles`
- CLI MCP baseline coverage exercises the visible user-facing MCP failure
  surface in addition to focused registry/provenance/runtime tests

Important boundaries:

- approval denied, MCP unavailable, and MCP execution failed remain separate
  failure classes; this route does not collapse them into a generic error
- this does not change provider/auth core, real-provider readiness, default
  production `apply_patch`, unified diff rejection, rollback, atomic
  transactions, or multi-file write behavior
- real-provider gate was not required because the route changes MCP/tool
  failure classification and session/result display only, without touching
  provider-facing credential or provider readiness paths

Validation recorded for the closeout commit:

- `rtk npm run build -w packages/ts-shell`
- `rtk npm run verify:result-contract`
- `rtk npm run test -w packages/ts-shell -- src/core/tools/runtime.mcp-stale-reconnect.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/mcp/gateway.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/tools/toolExecutionProvenance.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "MCP"`

### Current closeout: non-write stopped `/continue` replay evidence

The stopped result `/continue` replay evidence route has been extended beyond
writer-started write failures to cover representative non-write stopped cases.

Recent closeout commit:

- `6e62235 Add non-write stopped continue replay evidence`

Key sealed evidence:

- `/continue` has real CLI child-process fixture coverage for
  `patch-generation-failed`, `stale-read`, and `approval-denied`
- non-write stopped continuity preserves target, reason, blocker kind, failed
  file, and next action through the session handoff path
- no-writer stopped paths do not render `writer-started=yes`,
  `write-effect=*`, changed files, write intents, or success handoff
- `approval-denied` is now recognized as an actionable blocker kind in the
  no-write runtime result/resultMapper/session continuity path
- raw result evidence may still contain internal no-write markers such as
  `apply-patch-workspace-write-result:write-effect:none`; that remains
  acceptable as result evidence and does not enter continuity seed/display

Important boundaries:

- provider-readiness failure remains a current-turn/pre-query readiness concern,
  not an action-result `/continue` handoff
- this does not enable default production `apply_patch` writes
- this does not change provider/auth core, CLI provider readiness, release
  gates, rollback, atomic transactions, or default unified diff rejection
- real-provider gate is not required because this route changes synthetic
  session/result continuity evidence only and does not touch provider-facing
  behavior

### Current closeout: writer-started stopped-session continuity

The apply_patch writer-started stopped-session continuity route is stage-sealed
on `main`.

Recent closeout commits:

- `e8602e5 Add writer-started stopped session continuity`
- `271742a Narrow writer continuity evidence`

Key sealed evidence:

- explicit selected-workspace writer-started stopped states persist
  `writerStarted`, `writeEffect=unknown|unverified`,
  `requiresUserInspection`, target, reason, blocker, and next action through
  the session continuity seed
- next turn and `/continue` render failure handoff, target,
  `writer-started=yes`, `write-effect=unknown|unverified`, and re-read next
  action instead of success handoff
- writer-started stopped paths keep `changedFiles=[]` and do not expose
  write success or write intents
- no-writer blocked routes no longer surface `writeEffect=none` in the
  continuity display/seed path
- `/continue` now has end-to-end synthetic fixture coverage for both
  `writeEffect=unknown` and `writeEffect=unverified`

Important boundaries:

- this does not enable default production `apply_patch` writes
- this does not add rollback, atomic transactions, multi-file/add/delete/move,
  AST, or fuzzy patch support
- real-provider gate was not required for the final continuity evidence
  narrowing because no provider-facing route or provider/auth logic changed
- future behavior branches that change writer-reachable route semantics should
  rerun the selected-workspace real-provider smoke before claiming
  real-provider safety

Validation recorded for the final narrowing commit:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/workspaceWriteResult.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/lightweightChat.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

### Current closeout: default CLI truthfulness / continuity

The default CLI output and interaction-continuity route is stage-sealed on
`main`.

Recent closeout commits:

- `b0dca85 Make CLI turn endings truthful`
- `f7cc6ef fix cli continuity recovery surface`

Key sealed evidence:

- turn endings now use a focused turn-boundary surface instead of ad hoc CLI
  wording
- `/sessions current`, `/sessions switch`, `/resume`, and `/continue` share the
  current session store and surface resume readiness from `sessionStateSurface`
- `runResumeLikeShellAction` consumes `autoResume` payloads with runtime seed and
  continuity state instead of only opening session context
- completed-session `/continue` carries continuity seed notes through the
  lightweight no-write route
- interrupted resume smoke now uses a local HTTP mock, reducing provider mock
  leakage from `NODE_OPTIONS --require`
- the explicit lightweight real-provider gate passed with redaction and
  repository-clean checks

Important boundaries:

- this does not prove true PTY terminal fidelity
- this does not enable default production `apply_patch` writes
- this does not add multi-file/add/delete/move/AST/fuzzy/rollback support
- writer-started stopped-session continuity is now sealed separately on `main`

### A. Transport-unified turn execution (already landed)

- shared turn resolver/executor paths across interactive, `--print`, stdin, and replay
- stdin moved to stream-first reading + sequential prompt batch execution
- interactive in-flight gating to reduce overlapping-turn submission issues

### B. Answer-first terminal rendering contract (landed)

- compact mode suppresses planner-phase leakage (for example `Plan accepted...`)
- compact mode renders minimal terminal outcome + minimal coding contract
- verbose mode keeps full lifecycle/result diagnostics for developer view
- minimal result classification now considers task satisfaction evidence to avoid misleading “completed=success” messaging in blocked flows

### C. Live turn boundary UX (landed in interactive path)

- interactive turn boundary markers:
  - `=== Turn N ===`
  - `=== End Turn N ===`

### D. Single-file edit repair acceptance (stage closeout)

Real-provider CLI acceptance now covers the two core single-file edit repair chains:

| Scenario | Provider acceptance | Status | Key evidence marker | Regression guard |
| --- | --- | --- | --- | --- |
| replace success | synthetic | pass | changedFiles / change summary | `runMvpIntegratedFlow.test.ts` focused edit coverage |
| patch-from-not-found failure | real-provider + synthetic | pass | `failureReason:patch-from-not-found`, actionable nextAction | `runMvpIntegratedFlow.test.ts` patch-from-not-found coverage |
| patch-from-not-found follow-up repair | real-provider + synthetic | pass | `repairContextUsed:true`, `repairedFailureReason:patch-from-not-found`, `repairPayloadKind:replace-directive` | `runMvpIntegratedFlow.test.ts` repair follow-up coverage |
| patch-ambiguous failure | real-provider + synthetic | pass | `failureReason:patch-ambiguous`, matched-count explanation, actionable nextAction | `runMvpIntegratedFlow.test.ts` patch ambiguous coverage |
| patch-ambiguous follow-up repair | real-provider + synthetic | pass | `repairContextUsed:true`, `repairedFailureReason:patch-ambiguous`, `repairPayloadKind:replace-directive` | `runMvpIntegratedFlow.test.ts -t "repairs patch ambiguous"` |
| repair evidence visible in CLI surface | real-provider + synthetic | pass | repaired failure reason / target file / payload kind visible in Action result | `sessionRuntime.test.ts` repair context rendering |
| multi failed target abandoned diagnostic | synthetic + real CLI acceptance | pass | `repairContextUsed:false`, `repairContextAbandoned:true`, `multiple-failed-targets`, candidate count | `runMvpIntegratedFlow.test.ts -t "failed target candidates"` and `sessionRuntime.test.ts` |


### E. Real-provider minimal coding flow evidence (stage-sealed 2026-05-05)

The explicit opt-in `--real-coding-flow-smoke` has passed for the isolated minimal single-file write route. This is evidence that a real provider can enter the coding flow, read and edit the isolated fixture, emit a visible terminal result, and preserve repository/provider-home safety boundaries.

Key sealed evidence:

- real provider preflight was ready before execution
- normal coding flow was entered; the turn was not handled by repo-aware summary routing
- action sequence included `read` and `edit`
- only `note.txt` changed; `changedFiles` was exactly `["note.txt"]`
- `note.txt` changed from `status: draft` to `status: ready`
- protected fixture files `README.md` and `LOCKED.md` stayed unchanged
- verification passed and terminal result details were visible
- real repository stayed clean before/after the smoke
- runtime home, fixture workspace, report, and audit log were isolated under the test root and cleaned after the run
- redaction passed; real provider config content, paths, tokens, keys, and headers were not printed or committed
- mutation diagnostics were corrected so successful structured edits no longer misleadingly report missing replacement fields

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of `release-core`, `cli-entry`, `result-contract`, CI, or any default gate
- real provider configuration must still be supplied explicitly and must not be read, printed, copied, modified, cleaned, or committed
- the evidence covers only the isolated fixture's minimal single-file write path
- it does not prove maturity of multi-file edit, full `apply_patch`, long-task continuity, true PTY automation, or production repository mutation workflows

Recent route-closing commit:

- `4b6b90c Fix real coding smoke mutation diagnostics source`

### F. Real-provider failure follow-up explanation evidence (stage-sealed 2026-05-05)

The explicit opt-in `--real-coding-flow-followup-smoke` has passed for the synthetic stopped/failure follow-up route. This is evidence that a real provider can receive a redacted `patch-from-not-found` / `mutation instruction missing` context through the non-mutating direct-provider explanation path and produce a safe recovery explanation without mutating the fixture or repository.

Key sealed evidence:

- `followupExecutionPath=direct-provider-explanation`
- `enteredEditTargetResolution=false` and `ambiguousTargetDetected=false`
- `responseVisible=true`
- `acknowledgesTarget=true` for `note.txt`
- `acknowledgesFailure=true` for the stopped/failure context
- `safeNextAction=true`
- `claimsSuccess=false`
- `fixtureMutationLeak=false`
- `repositoryClean=true`
- audit output was isolated under the test root
- redaction passed; real provider config content, paths, tokens, keys, and headers were not printed or committed

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of `release-core`, `cli-entry`, `result-contract`, CI, or any default gate
- it validates failure-context explanation only, not automatic recovery, edit repair execution, durable stopped-session resume, or stopped-session auto-recovery
- stopped durable session auto-recovery strategy is unchanged

Recent route-closing commits:

- `f4957e3 Use direct provider path for coding flow follow-up smoke`
- `652434b Fix direct provider follow-up eval wrapper`

Explicitly unsupported in this stage:

- fuzzy replace matching
- AST edit
- multi-file edit repair expansion
- multi failed target automatic repair
- implicit workspace/root mode changes as part of edit repair


### G. Single-file `apply_patch` pre-production surface contracts (stage-sealed 2026-05-05)

The single-file `apply_patch` route is sealed through contract-only dry-run, stale-read, permission metadata, terminal-safe surface, runtime bridge, resultMapper consumer, and sessionRuntime display contracts. This proves preview / blocked / permission-pending states remain non-mutating and non-success-like across mapper/display projections.

Important boundaries:

- production `apply_patch` and unified diff inputs remain rejected in the mutation lane
- no production writer, CLI, `runMvpIntegratedFlow`, resultMapper production logic, or sessionRuntime production logic is wired for this route
- production write decision gate remains blocked pending explicit permission UX, final stale-read revalidation placement, writer boundary proof, and approved runtime/display wiring

Recent route-closing commits:

- `7aee9f8 Add single file apply patch resultMapper consumer contract`
- `d9658e5 Add single file apply patch sessionRuntime display contract`

### H. Single-file `apply_patch` result/session safe wiring seams (stage-sealed 2026-05-06)

The production write gate preconditions and result/session safe wiring phase are sealed at contract/seam level. The route now has explicit permission UX, final stale-read, writer boundary proof, resultMapper seam, and sessionRuntime seam coverage without production runtime wiring.

Key sealed evidence:

- resultMapper-facing seam consumes mapper-safe projection only
- sessionRuntime-facing seam consumes resultMapper seam output only
- dry-run, blocked, and permission-pending states stay non-success-like
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`, no writer invocation, no applied patch record, and no mutation success remain preserved
- actionable `nextAction` / `doNext` stays visible through the seam outputs

Important boundaries:

- production `resultMapper.ts` and `sessionRuntime.ts` logic is still unchanged for this route
- CLI, SessionManager, `runMvpIntegratedFlow`, provider/auth, real-provider scripts, release gates, and writer code remain unwired
- production `apply_patch` and unified diff rejection behavior remains required
- real-provider coverage remains unnecessary for this seam-only phase and is not meaningful for production write until a route is separately approved

Recent route-closing commits:

- `Add single file apply patch resultMapper seam contract`
- `Add single file apply patch sessionRuntime seam contract`
- `Document single file apply patch result session safe wiring blockers`

### I. Single-file `apply_patch` real-provider non-mutating dry-run smoke (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-dry-run-smoke` has passed for the
single-file `apply_patch` production-adjacent dry-run route. This is evidence
that a real provider can produce a single-file `apply_patch` preview and that
the preview can pass through the explicit opt-in dry-run route without writing.

Key sealed evidence:

- real provider preflight was ready before execution
- the provider produced exactly one `apply_patch` preview block for `src/app.ts`
- route status and display status stayed `permission-pending`
- terminal classification stayed `stopped`, not `success`
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`
- `noWriterInvoked=true` and no applied patch record was recorded
- fixture files stayed unchanged and the real repository stayed clean
- redaction passed; real provider config content, paths, tokens, keys, and
  headers were not printed or committed

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of release/default
  gates or CI
- it validates only a provider-facing non-mutating dry-run preview
- production `apply_patch` and unified diff inputs remain rejected by default
- production write, writer invocation, and production resultMapper/sessionRuntime
  wiring remain blocked pending separate review

Recent route-closing commits:

- `Add single file apply patch real provider dry run smoke`
- `Document single file apply patch real provider dry run gate outcome`

### J. Single-file `apply_patch` real-provider permission UX no-write gate (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-permission-ux-smoke` has passed for the
single-file `apply_patch` provider-facing permission UX route. This is evidence
that a real provider can produce a single-file `apply_patch` preview and the
runtime can project pending, denied, and blocked permission UX states without
writing or claiming success.

Key sealed evidence:

- real provider preflight was ready before execution
- the provider produced exactly one `apply_patch` preview block for `src/app.ts`
- permission UX states stayed distinct: `pending`, `denied`, and `blocked`
- terminal classification stayed `stopped`, not `success`
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`
- `noWriterInvoked=true` and no applied patch record was recorded
- fixture files stayed unchanged and the real repository stayed clean
- redaction passed; real provider config content, tokens, keys, and headers were
  not printed or committed

Important boundaries:

- this smoke remains explicit opt-in only; it is not part of release/default
  gates or CI
- it validates only provider-facing permission UX no-write projection
- approval still does not authorize a write
- production `apply_patch` and unified diff inputs remain rejected by default
- production write, writer invocation, and production resultMapper/sessionRuntime
  wiring remain blocked pending separate review

### K. Single-file `apply_patch` isolated fixture write smoke (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-write-fixture-smoke` now exists and is
validated locally and by real provider as the narrow isolated fixture write
gate. After a route bridge repair, the real-provider rerun passed.

Key sealed evidence:

- readiness preflight passed
- default production `apply_patch` / unified diff rejection regression passed
- real-provider model path was reached
- provider output contained exactly one `apply_patch` block
- write decision status was `approved-for-write`
- isolated write lane status was `written`
- only isolated fixture `src/app.ts` changed
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- `fixtureWriterInvoked=true`
- `productionWriterInvoked=false`
- terminal success was allowed only after verified isolated fixture write
- no applied patch record was recorded
- redaction passed
- real repository stayed clean

Current gate state: passed as an explicit opt-in isolated fixture write gate.
It is not production write wiring and is not evidence that production write may
be enabled by default.

Important boundaries:

- this smoke remains explicit opt-in only and uses a temporary fixture
- production `apply_patch` and unified diff inputs remain rejected by default
- production write, writer invocation, and production resultMapper/sessionRuntime
  wiring remain blocked pending separate review
- no further automatic provider retry is planned; any future rerun requires
  explicit real-provider opt-in, isolated fixture, redaction, and repo-clean
  constraints

### L. Single-file `apply_patch` guarded production-write candidate smoke (stage-sealed 2026-05-06)

The explicit opt-in `--real-apply-patch-guarded-write-smoke` has passed for the
single-file `apply_patch` guarded production-write candidate lane against an
isolated temporary workspace.

Key sealed evidence:

- readiness preflight passed
- real-provider model path was reached
- provider output contained exactly one `apply_patch` block
- write decision status was `approved-for-write`
- guarded gate status was `ready`
- guarded write lane status was `written`
- only isolated workspace `src/app.ts` changed
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- production writer was invoked only with `productionWriterTarget=isolated-workspace`
- `realRepositoryWrite=false`
- terminal success was allowed only after verified isolated workspace write
- no applied patch record was recorded
- redaction passed
- real repository stayed clean

Important boundaries:

- this smoke remains explicit opt-in only and uses a temporary workspace
- production `apply_patch` and unified diff inputs remain rejected by default
- default production write remains blocked
- production result/session/runtime wiring still requires a separate review
- the passing guarded candidate does not approve multi-file/add/delete/move,
  AST, fuzzy patching, rollback, or release/default gates

### M. Single-file `apply_patch` guarded production route seam (stage-sealed 2026-05-06)

The guarded production route seam has been added and validated locally for an
explicit opt-in, single-file Update File route against an isolated temporary
workspace.

Key local evidence:

- route wiring gate requires explicit route opt-in
- guarded gate must be `ready`
- write decision must be `approved-for-write`
- final stale-read remains immediately before the writer
- result/session status is write-success only after verified write
- non-opt-in route requests remain stopped/no-write
- default production `apply_patch` and unified diff rejection remains unchanged

Real-provider guarded route smoke status:

- readiness preflight passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- real-provider model path was reached
- provider output contained exactly one `apply_patch` block
- write decision status was `approved-for-write`
- guarded gate, route gate, production route, and write lane were ready/written
- resultMapper projection mapped the verified route write to `completed/success`
- session display projection showed `write-success` only after the verified write
- only isolated workspace `src/app.ts` changed
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- production writer was invoked only with `productionWriterTarget=isolated-workspace`
- `realRepositoryWrite=false`
- terminal success was allowed only after verified isolated workspace write
- no applied patch record was recorded
- repository clean: true
- redaction: pass

Current gate state: passed as an explicit opt-in guarded route gate against an
isolated workspace. This is not default production write enablement.

Important boundaries:

- this smoke remains explicit opt-in only and uses a temporary workspace
- production `apply_patch` and unified diff inputs remain rejected by default
- default production write remains blocked
- production CLI / `runMvpIntegratedFlow` write wiring still requires a separate
  entrypoint review before touching real user workspaces

### N. Single-file `apply_patch` CLI / runMvp no-write entrypoint (landed 2026-05-06)

The single-file `apply_patch` route now has an explicit CLI /
`runMvpIntegratedFlow` no-write entrypoint for raw Update File payloads against
the selected workspace.

Key evidence:

- CLI requires `--apply-patch-runtime-route` before the runtime route is used
- `runMvpIntegratedFlow` requires an explicit `applyPatchRuntimeRoute` option
- requested approval from `--non-interactive-approval allow-once|allow-always`
  is recorded only as permission UX input and does not authorize a write
- runtime output is mapped from the safe no-write projection
- terminal/session output stays stopped/non-success-like
- `changedFiles=[]`, `writeIntents=[]`, no writer invocation, and no applied
  patch record remain preserved
- the CLI entrypoint leaves the selected workspace file unchanged

Important boundaries:

- this is not real-user workspace write enablement
- production `apply_patch` and unified diff inputs remain rejected by default
- write success remains limited to the explicit isolated-workspace guarded route
- real-workspace writer routing still requires a separate write-entrypoint
  review for UX, durable state, abort/rollback, and final writer boundary

### O. Single-file `apply_patch` real workspace write entrypoint (landed 2026-05-07)

The single-file `apply_patch` route now has an explicit CLI /
`runMvpIntegratedFlow` write entrypoint for raw `Update File` payloads against
the selected workspace.

Key implemented boundaries:

- CLI requires `--apply-patch-workspace-write` before the workspace writer is
  reachable
- existing `--apply-patch-runtime-route` remains no-write when the workspace
  write flag is absent
- `--non-interactive-approval allow-once|allow-always` is required as explicit
  approved-for-write input for this entrypoint
- final stale-read runs immediately before the writer
- writer success is projected only after post-write content verification
- selected workspace authority rejects symlink targets, validates realpath
  workspace containment, and uses descriptor-verified reads/writes for the
  opened target
- symlink swaps at the writer boundary are blocked without reporting changed
  files or write success
- abort before the selected-workspace writer is reached now stops the route with
  no write effect, and writer-started failures now preserve durable
  `unknown`/`unverified` write-effect attribution for user inspection before
  retry
- workspace-boundary, write-application, and post-write verification failures
  now surface as stopped write/readback blockers instead of generic success-like
  results
- denied, blocked, stale, unsupported, and no-op routes remain stopped and do
  not report changed files or write success
- default production `apply_patch` and unified diff rejection remains required

Real-provider workspace-write smoke status:

- readiness preflight passed with explicit `PRIVATE_AGENTS_REAL_HOME`
- real-provider model path produced exactly one `apply_patch` block
- CLI workspace write entrypoint wrote only isolated test workspace `src/app.ts`
- `changedFiles=src/app.ts` and `writeIntents=src/app.ts`
- writer target was isolated test workspace
- terminal success was allowed only after verified write
- repository clean: true
- redaction: pass

Important boundaries:

- this is not default production `apply_patch` enablement
- this does not add multi-file/add/delete/move/AST/fuzzy/rollback support
- this does not add rollback or full atomic transaction semantics; if the writer
  has started and verification cannot prove success, the user-visible state is
  stopped and requires re-reading the current target before retry
- this does not change release/default gates
- real-provider workspace-write smoke must run only with explicit opt-in,
  isolated HOME/test workspace, redaction, and repository-clean checks

## 6. Confirmed Baseline Facts

- unified query loop exists and is durable
- replay/recovery substrate exists
- lifecycle compensation exists
- terminal envelope semantics exist (`terminalReason` + classification)
- provider readiness gate exists before real-provider execution
- compact vs verbose user output layering exists
- `/connect` is the provider onboarding command family (not `/auth`)

## 7. Current Primary Gaps

1. true PTY automation evidence remains weaker than print/stdin/replay and
   pipe-spawn interactive evidence in this environment
2. execution success still depends on model/tool behavior; sealed real-provider
   smokes prove only their explicit isolated or selected-workspace routes
3. multi-file edit, default production `apply_patch` write, rollback/atomic
   write recovery, and true PTY automation remain outside the sealed evidence
4. production single-file `apply_patch` default CLI / `runMvpIntegratedFlow`
   write route remains disabled; an explicit CLI/runMvp no-write route exists,
   an explicit workspace write entrypoint has landed with durable
   writer-started failure attribution, and default rejection is still required
5. real-provider write evidence covers explicit opt-in isolated or selected
   test workspaces, not default real user workspace mutation
6. some legacy docs and examples still reflect previous phase assumptions and need gradual cleanup

## 8. Re-entry / Escalation Triggers

Escalate from hardening into focused implementation when one is reproducible:

1. real live-CLI task shows answer/result boundary regression (answer missing, noisy leakage, or false completion)
2. transport parity drift appears between interactive and non-interactive paths
3. continuity breaks in active session for core coding workflow (read/edit/verify follow-up)

## 9. Current Minimal Next Step

- Do not continue same-family CLI truthfulness, approval/tool provenance, PTY
  boundary, or minimal apply_patch evidence work unless a regression appears.
- Writer-started stopped-session continuity for explicit selected-workspace
  `apply_patch` results is now sealed for next turn and `/continue`; do not
  continue that same-family route unless a new regression appears.
- Non-write stopped `/continue` replay evidence for
  `patch-generation-failed`, `stale-read`, and `approval-denied` is now sealed;
  do not keep expanding same-family stopped replay fixtures unless a concrete
  stopped/resume regression appears.
- If continuing apply_patch, the next route should be a fresh blocker
  assessment around default-route safety, rollback/atomicity, or user-workspace
  policy rather than more continuity proof.
- Keep default production `apply_patch` enablement blocked until a separate
  review defines rollback behavior and default user-workspace safety policy.
- Existing real-provider gates remain explicit opt-in evidence only; do not
  rerun them for documentation-only changes or unrelated route selection.
- Avoid unrelated provider/auth expansion during this stage unless it blocks
  mainline usability.

## 10. Update Rules

Update this file when one of these changes materially:

- stage objective or stage mode
- product mainline contract
- baseline facts or primary gaps
- escalation triggers

Do not turn this file into:

- run-by-run transcript dump
- roadmap backlog
- provider marketing sheet
