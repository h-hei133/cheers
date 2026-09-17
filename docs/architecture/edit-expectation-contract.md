# Edit Expectation Contract

Route: `docs/agent-routes/route143-edit-expectation-contract.md`

## Scope

Route 143 cleaned up the remaining write/edit expectation cluster without
expanding edit capability, provider behavior, browser behavior, session schema,
CLI behavior, dependencies, or broad `runMvpIntegratedFlow.ts` structure.

Starting full runMvp baseline: `127 passed / 24 failed`.

Current full runMvp baseline after this route: `144 passed / 7 failed`.

## Contract

- Write requires an explicit in-workspace target path and concrete content.
- Concrete content means fenced content or an explicit inline content literal.
  Vague prompts such as "create a script" do not synthesize arbitrary content.
- Edit requires one explicit in-workspace target plus a concrete replacement,
  patch, or fenced target content.
- Ambiguous sibling targets stop actionably before mutation.
- Broad refactor, batch edit, and discovery edit are future capability routes,
  not current-contract success paths.
- No-write read/inspect paths stay separate from mutation paths.
- Successful bounded mutation may still end as recoverable `stopped_error` when
  Route 141 verification is skipped.

## Reference Scan

Bounded reference scan was shape-only; no implementation code was copied.

- Gemini CLI `write-file` requires `file_path` and `content` parameters,
  matching the concrete-content requirement.
- Gemini CLI `edit` uses structured `old_string` / `new_string` replacement and
  has broader fuzzy recovery that this route intentionally does not add.
- Claude Code `FileWriteTool` requires absolute `file_path` and `content`, with
  permission and secret checks before writing.
- Claude Code `FileEditTool` uses structured file path plus edit strings and
  read/stale-write protection; this route keeps the local bounded surface
  narrower.
- opencode `apply_patch` requires structured `patchText` and parses hunks before
  permission/application, reinforcing that broad patch/edit behavior is not
  inferred from vague prose.

## New Owner

- `packages/ts-shell/src/orchestration/editExpectationContract.ts`
- `packages/ts-shell/src/orchestration/editExpectationContract.test.ts`

The helper is pure. It does not read files, write files, approve writes, call
providers, run tools, or change permission semantics.

## Targeted Failure Decisions

| Test family | Classification | Decision |
|---|---|---|
| create/write Python file without content | stale expectation | rebaselined to actionable stopped; no generated content |
| write explicit path without content | product drift + stale expectation | fixed routing from chat success to write-file stopped |
| infer Python target in current directory | obsolete scenario | rebaselined to target-required stopped |
| mojibake write prompt | obsolete scenario | rebaselined to no deterministic mutation contract |
| current-directory write with explicit Chinese content | product drift + stale terminal expectation | fixed `内容是` parsing; mutation applies, skipped verification remains recoverable stopped |
| write readback without content | stale expectation | rebaselined to concrete-content stopped |
| fenced single-file replacement | stale terminal expectation | mutation applies; skipped verification is recoverable stopped |
| edit repair follow-ups | stale terminal expectation | repair applies; skipped verification is recoverable stopped |
| batch/refactor/discovery edit | future capability backlog | rebaselined to actionable stopped without broad expansion |
| partial batch terminal classification | stale result expectation | rebaselined to stopped, not hard error |

## Implementation Notes

- `editExpectationContract.ts` classifies concrete write, missing content,
  missing target, bounded edit, unsupported refactor, unsupported batch edit,
  unsupported discovery edit, no-write inspect, and ambiguous mutation.
- `runMvpIntegratedFlow.ts` now recognizes `Write <path>` as write intent when
  the path is explicit, so missing content stops actionably instead of becoming
  chat success.
- Chinese inline content now accepts `内容是 ...`.
- Discovery edit is preempted before command execution so `Edit this repository
  ... then run node --version` stays an unsupported edit, not a run-command.
- Broad refactor, batch mutation, discovery mutation, generated script content,
  and broad fenced replacement behavior remain out of scope.

## Validation Evidence

- Focused edit expectation tests: `7 passed`
- Focused edit/write runMvp cluster: `18 passed / 140 skipped`
- Full `runMvpIntegratedFlow.test.ts`: `144 passed / 7 failed`
- Preservation suite for Route 142/141/140/139/138/137 surfaces:
  `73 passed` across continuation lineage/planning, verification planner,
  read/inspect intent, command/capability boundary, flow dispatch/projection,
  result mapper, dispatcher, and edit expectation tests.
- ~~`rtk npm run verify:edit-capability-closeout`~~ (removed 2026-09-17): passed.
- `rtk npm run verify:result-contract`: passed.
- `rtk npm run build -w packages/ts-shell`: passed.
- `rtk git diff --check`: passed.

Remaining failures are outside this route:

| Cluster | Count | Notes |
|---|---:|---|
| approval/transcript/resume harness | 3 | callback prompt expectation, single-assistant role expectation, legacy resume role normalization |
| provider mock harness | 3 | deterministic provider transcript still expects reviewer turn |
| git-aware change set attribution | 1 | git attribution remains isolated from edit expectation contract |

## Next Recommended Cluster

Route 144 should target approval/transcript/resume harness cleanup before
provider harness work. It is tied to the default user/session surface and does
not require provider live calls, browser work, edit expansion, schema changes,
or CLI/dependency changes.
