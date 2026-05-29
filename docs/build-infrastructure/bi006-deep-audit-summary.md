# BI006 Deep Audit Summary

Final status: complete if the BI006 validation commands pass.

This route created documentation only. It did not implement product code,
route runners, verify scripts, JSON capability reports, package scripts, new
dependencies, package installation, dynamic plugin execution, provider default
enablement, session schema migration, runtime rewrites, or ExecutionService
bypass.

## Serena Inspection Summary

Serena was available and used on both required repositories:

- Current project: `/home/wang/projects/coding-agents`
- Pi reference repo: `/home/wang/projects/pi`

Current project areas inspected:

- runtime workflow coordination
- turn snapshot
- runtime phase and event projections
- runtime execution and ExecutionService
- runtime resources
- session tree projection, continuation, compaction, and future-turn surfaces
- evidence save point
- result truthfulness adjacency
- provider draft/readiness adjacency
- tools registry and tool result details
- CLI/session product surfaces
- planning and context runtime stages

Pi areas inspected:

- `AgentHarness` lifecycle, queues, phase, save point, provider request hooks,
  steering, follow-up, next-turn, and resource handling
- low-level agent loop and sequential/parallel tool execution
- harness types for session tree, compaction, branch summary, tool hooks,
  provider hooks, `ExecutionEnv`, `FileSystem`, `Shell`, tool result details,
  and events
- `AgentSession`, extension binding, runtime rebuild, model switching,
  compaction, branch navigation, and follow-up/steering behavior
- `SessionManager`, append-only entries, parent ids, leaf ids, branch/fork,
  compaction, branch summaries, and context rebuild
- resource loader, packages, skills, prompts, themes, extensions, and context
  files
- extension API, extension runner, message renderers, provider/tool/command/UI
  hooks, and session hooks
- model registry, provider registry, environment auth lookup, custom provider
  registration, and compatibility flags
- SDK/RPC/JSONL host surfaces
- TUI/tool/export renderers
- file mutation queue

## Pi Docs Inspection Status

Internet access was available. Pi official docs were checked for:

- extensions
- sessions and session format
- compaction
- SDK
- RPC mode
- JSON mode
- packages
- providers
- models

Docs confirmed the local Pi findings at the product level: Pi exposes
extension APIs, session/compaction concepts, programmatic SDK/RPC/JSON modes,
package resources, and provider/model configuration surfaces.

## Documents Created

- `docs/build-infrastructure/pi-deep-audit-uncovered-patterns.md`
- `docs/build-infrastructure/pi-next-direction-map.md`
- `docs/build-infrastructure/pi-pattern-rejection-and-delay-log.md`
- `docs/build-infrastructure/build-infrastructure-route-index.md`
- `docs/build-infrastructure/bi006-deep-audit-summary.md`

`docs/DOC_STATUS.md` should classify the new BI006 documents as historical
route/audit outputs so future routes do not treat them as default code truth.

## Final Audit Conclusion

BI001 to BI005 covered the first Pi-inspired infrastructure layer:

- frozen turn snapshot
- runtime phase vocabulary
- evidence-only save point
- ExecutionService error taxonomy and receipts
- tool result content/details split
- schema-neutral session projection
- host-neutral runtime event projection
- static resource descriptors and projections

The important remaining Pi value is not another low-level runtime rewrite. The
next useful work is controlled boundaries around extension lifecycle, branch
and compaction semantics, host-neutral runtime APIs, provider/model metadata,
tool permission hooks, package governance, and rendering adapters.

## Top Adopt-Now Candidates

1. Extension lifecycle and hook boundary
   - Owner domains: `runtime/resources`, future extension owner, policy,
     `core/tools` observation, provider metadata, CLI display.
   - Adopt as non-executable/default-off lifecycle and hook projection.

2. Session branch, compaction, and context rebuild
   - Owner domains: `session`, `context`, `evidence`, `result`.
   - Adopt as schema-neutral projection before persistence migration.

3. Programmatic runtime API and JSON event stream
   - Owner domains: `runtime/events`, `runtime`, `session`, `result`, CLI host.
   - Adopt after current event projection is stable.

4. Provider/model registry with compatibility flags
   - Owner domains: `provider`, model adapter owner, `runtime/resources`.
   - Adopt as default-disabled metadata and fake-provider-safe tests first.

5. Tool hook permission interception
   - Owner domains: `core/tools`, policy, `runtime/execution`, `evidence`,
     `result`.
   - Adopt only as constrained allow/deny/observe hooks that cannot rewrite
     terminal truth.

## Top Adapt-Later Candidates

- Resource loading beyond static descriptors.
- Package/resource install and update governance.
- Extension state persistence and branch-aware state rebuild.
- Steering, follow-up, and next-turn delivery modes.
- Provider request hooks and per-request auth refresh.
- Parallel read-only tool execution experiment.
- Per-file mutation queues.
- UI/message renderer registry.
- Runtime host separation beyond CLI.

## Rejected Candidates

- Direct Pi package/file structure.
- TUI package adoption as a build-infrastructure goal.
- Dynamic plugin execution.
- Provider default enablement.
- Session schema migration as the first branch route.
- Pi ExecutionEnv copied as a second side-effect path.
- Tool hooks that can rewrite success outside Result Surface.

## Recommended Next Routes

1. BI007: `Extension Lifecycle And Hook Boundary`
2. BI008: `Session Branch Compaction And Context Rebuild`
3. BI009: `Programmatic Runtime API And JSON Event Stream`
4. BI010: `Provider Model Registry And Compatibility Flags`
5. BI011: `Tool Hook Permission Interception`
6. BI012: `Package Resource Governance`
7. BI013: `UI Rendering And Message Renderer Boundary`

## Immediate Next Route

BI007: `Extension Lifecycle And Hook Boundary`

Scope:

- default-disabled lifecycle states
- non-executable hook boundary
- report-safe hook categories
- no plugin execution
- no package loading
- no provider registration or provider call
- no dynamic discovery
- no terminal success from hook/resource availability

Validation:

- focused lifecycle/descriptor tests
- hook redaction tests
- default-off/non-executable tests
- result truthfulness tests proving hook presence is not success
- `git diff --check`
- `git status --short --branch`

## No Product Code Change Confirmation

BI006 intentionally changes documentation only. Product code under
`packages/ts-shell/src`, package scripts, runtime behavior, provider gates,
session schemas, tests, and build configuration are out of scope for this
route.
