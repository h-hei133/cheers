# Build Infrastructure Closeout Summary

Status: BI017 closeout.
Date: 2026-05-29.

## Scope

This document closes the BI001 to BI016 build-infrastructure sequence. It is an
audit and transition document, not a product implementation report.

Inspection used local route documents, AGENTS.md, targeted agent-rules, current
TypeScript product surfaces, package scripts for context only, and Serena symbol
overview for the main owner surfaces. No external repositories were inspected.

## Final Status

BI001 to BI016 are represented in `docs/build-infrastructure/route`.

Current closeout finding:

- BI001 and BI006 are docs/planning routes.
- BI002 to BI005 and BI007 to BI016 are product infrastructure routes.
- The built infrastructure is primarily projection, metadata, contract, event,
  truthfulness, and presentation infrastructure.
- It does not prove full product loop replacement.
- It does not enable real provider streaming, dynamic plugin execution, package
  loading, SDK/RPC server behavior, TUI behavior, or product tool batch
  execution.

## Route Summary

| Route | Current status | Type | Owner domains | Main artifact | Not-proven or deferred claims |
|---|---|---|---|---|---|
| BI001 Pi-inspired architecture planning | Complete by docs | Docs-only | docs, architecture planning | Planning summary, pattern matrix, roadmap, delay log | Product implementation, external-origin naming, dynamic loading |
| BI002 Runtime turn snapshot and save point | Complete as product infrastructure | Product code | `turn`, `runtime`, `evidence`, `session`, `result` | `turnSnapshot.ts`, runtime phase, evidence-only save point | execution receipt, tool details, terminal success |
| BI003 Execution receipt and tool details | Complete as product infrastructure | Product code | `runtime/execution`, `tools`, `evidence`, `result`, `session` | execution receipts, command receipt projection, tool content/details split | command exit zero as success, direct side effects outside execution boundary |
| BI004 Session tree projection and event stream | Complete as projection infrastructure | Product code | `session`, `runtime/events`, `runtime`, `result`, `core/shell` | session tree/active-path projection, runtime event projection | storage-backed branching, full tree persistence, terminal success |
| BI005 Static resource contract experiment | Complete as metadata infrastructure | Product code | `runtime/resources`, `provider`, `runtime/events`, `core/shell` | static resource descriptors and projections | dynamic discovery, plugin execution, package loading |
| BI006 Pi deep audit and next directions | Complete by docs | Docs-only | docs, architecture planning | deep audit summary and next direction map | implementation details, full reference parity |
| BI007 Extension lifecycle and hook boundary | Complete as contract infrastructure | Product code | `runtime/extensions`, `runtime/resources`, `policy`, `tools`, `provider`, presentation as needed | extension lifecycle event and hook policy contract | executable plugin code, hook mutation, provider/tool success rewrite |
| BI008 Session branch, compaction, context rebuild | Complete as projection infrastructure | Product code | `session`, `context`, `evidence`, `result` | active path, branch/compaction projections, context rebuild projection | storage migration, storage-backed branching, storage-backed compaction |
| BI009 Runtime API and JSON event stream | Complete as host-boundary infrastructure | Product code | `runtime/events`, `runtime`, `session`, `result`, `core/shell` | JSON event stream projection and host-neutral runtime event stream | SDK server, RPC server, CLI as runtime owner |
| BI010 Agent loop reference implementation | Complete as local contract infrastructure | Product code | `runtime/loop`, `runtime`, `turn`, `tools`, `session`, `context`, `evidence`, `result` | local `agentLoopContract.ts` | product loop replacement, real provider streaming, real parallel tool execution |
| BI011 Provider/model registry compatibility | Complete as metadata infrastructure | Product code | `provider`, `runtime/resources`, `core/shell`, `result`, `evidence` | provider/model registry projection and compatibility flags | provider called, auth refresh, default enablement |
| BI012 Product naming and origin cleanup | Complete as cleanup/audit | Product code plus docs | product owner domains touched by cleanup | product naming origin audit and local naming cleanup | legacy compatibility names remain documented |
| BI013 Tool hook permission interception | Complete as policy infrastructure | Product code | `tools`, `policy`, `runtime/execution`, `evidence`, `result` | before-tool policy, after-tool annotation, blocked result projection | hook execution, authority bypass, success rewrite |
| BI014 Package resource governance | Complete as metadata governance | Product code | `runtime/resources`, `policy`, `provider` metadata | package inventory projection, manifest contract, conflict projection | installation, loading, network lookup, script execution, integrity proof |
| BI015 Product surface message rendering boundary | Complete as presentation infrastructure | Product code | `presentation`, `runtime/events`, `session`, `provider`, `tools`, `runtime/resources`, `evidence`, `result`, `core/shell` | product surface view model and terminal renderer | renderer as fact owner, hidden not-proven facts, terminal success |
| BI016 Agent loop integration spine | Complete as loop integration infrastructure | Product code | `runtime/loop`, `runtime/events`, `presentation`, plus referenced owner projections | loop infrastructure map and loop trajectory projection | full product loop replacement, real provider streaming, real tool batch execution, storage-backed branching |

## Product Code Versus Docs-only

Docs-only:

- BI001 planning outputs.
- BI006 deep audit and next-direction outputs.
- BI017 closeout outputs.

Product infrastructure:

- BI002 to BI005 and BI007 to BI016.
- These routes added local TypeScript owner-domain surfaces rather than broad
  runtime rewrites.
- The infrastructure is largely observation, metadata, projection, contract, and
  rendering support.

## Owner Domains Changed

Primary product owner domains touched across BI002 to BI016:

- `turn`
- `runtime`
- `runtime/loop`
- `runtime/events`
- `runtime/execution`
- `runtime/resources`
- `runtime/extensions`
- `session`
- `context`
- `tools`
- `provider`
- `policy`
- `presentation`
- `evidence`
- `result`
- `core/shell` as host/session adapter only

## Connected Infrastructure

Connected to the BI016 loop spine:

- prompt input
- turn snapshot
- runtime phase
- model/provider boundary observation
- provider/model metadata
- tool call batch metadata
- before-tool policy
- execution receipt
- tool result details
- after-tool annotation
- save point
- next turn preparation
- session active path
- context rebuild projection
- package/resource inventory metadata
- runtime events
- JSON event stream
- product surface sections
- result facts
- not-proven claims

Connection does not mean product success. The trajectory projection remains
observation-only and keeps `terminalSuccessClaim: false`.

## Projection-only Or Contract-only

Projection-only:

- session active path and branch/compaction projections
- context rebuild projection
- runtime event projection
- JSON event stream projection
- static resource registry projection
- package inventory projection
- provider/model registry projection
- product surface view model and terminal rendering

Contract-only or metadata-only:

- agent loop contract
- extension lifecycle event contract
- extension hook policy contract
- tool interception policy and after-tool annotation
- provider compatibility flags
- package manifest and governance metadata

## Deliberately Not-proven

The sequence deliberately does not prove:

- real provider streaming
- provider-called as success
- real provider auth refresh
- real tool batch execution through the current product loop
- parallel tool execution
- SDK or RPC server
- TUI or renderer plugins
- dynamic extension execution
- package installation, package loading, network lookup, or script execution
- session schema migration
- storage-backed branching or compaction
- branch-aware extension state
- dynamic resource discovery
- per-file mutation queue
- full product loop replacement
- terminal success outside evidence, verdict, and result truthfulness

## Product Code Pollution Audit

BI017 did not change product code. The closeout audit used targeted repository
search over `packages/ts-shell/src`, package scripts, and existing BI docs.

Findings:

- Route-numbered product files: no new route-numbered product files were added
  by BI017. Existing route-history scripts and package commands remain
  historical compatibility surfaces.
- External-origin product naming: no new external-origin product files were
  added by BI017. Existing browser harness provenance names remain documented by
  the BI012 naming audit.
- Process words in product filenames: no new process-word product filenames were
  added by BI017. Existing compatibility/history names such as
  `runMvpIntegratedFlow` and route-history commands remain documented
  exceptions.
- Compatibility shim business logic: no compatibility shim was changed by
  BI017. Existing shims must remain delegate/re-export surfaces.
- Helper/utils/common dumping grounds: targeted product file search found no
  new `helper`, `helpers`, `utils`, `misc`, `common`, or `support` dumping
  ground added by BI017.
- Provider default enablement: current provider/package/resource projections
  keep default enablement disabled unless a test deliberately exercises a
  rejection path.
- Dynamic plugin execution and package loading: current resource/package
  projections preserve disabled/not-proven states; BI017 added no loader,
  installer, dynamic discovery, or plugin execution path.
- Success claims outside evidence/result: route-specific search found
  `terminalSuccessClaim: true` only in tests that exercise rejection/redaction
  behavior, not in new BI017 product code.

## Validation Confidence

Confidence is medium-high for the closeout claims because they are grounded in:

- current route documents BI001 to BI017
- current product files under owner domains
- Serena targeted symbol overview for the main owner surfaces
- targeted repository search for route/pollution indicators

The closeout does not claim historical test runs passed. BI017 validation is
limited to documentation hygiene checks required by the route.

## Risk Notes

- `runMvpIntegratedFlow` remains as a legacy compatibility surface and is
  documented as a compatibility exception.
- Historical route verifier scripts and package commands still contain route and
  process vocabulary. They are history/compatibility surfaces, not new BI017
  product code.
- Existing browser harness provenance names remain covered by the earlier
  product naming audit compatibility note.
- Future product routes should now consume the infrastructure rather than add
  more general architecture scaffolding.
