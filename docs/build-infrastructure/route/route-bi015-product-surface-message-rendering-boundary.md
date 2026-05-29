# Build Infrastructure Route BI015: Product Surface Message Rendering Boundary

## Goal

Implement the next build-infrastructure route after BI014.

BI002 to BI014 added structured runtime facts:

- turn snapshots
- phases and save points
- execution receipts
- tool result details
- session projections
- runtime events
- resource and package metadata
- extension lifecycle and hook policy observations
- provider and model metadata
- tool interception metadata
- agent loop contract

BI015 must now create a clean product surface and message rendering boundary.

This is not a new TUI, theme system, renderer plugin system, UI framework, SDK UI, or interactive redesign.

Target capabilities:

- product surface view model
- semantic section model
- terminal message renderer contract
- CLI/session host adapter consumption
- display-safe severity and status labels
- consistency between human output and machine event facts
- redaction and truthfulness guardrails

Expected final status: COMPLETE.

## Why this route exists

The project now has many structured runtime facts, but without a central presentation boundary they can leak into output through scattered string formatting.

That would recreate the previous architecture problem:

- runtime modules formatting user output
- CLI inventing result meaning
- session surfaces hiding not-proven facts
- event stream and human output disagreeing
- package/resource/provider metadata looking like enabled capability
- hook/tool observations looking like task success

BI015 creates a product-owned presentation boundary so facts remain owned by their domains and the UI layer only renders them.

## Owner domains

Primary owners:

- product surface or presentation owner if one exists
- core/shell only as host adapter
- runtime/events for event-to-view projection
- session for session display projection
- result for terminal status input only
- evidence for not-proven and truthfulness facts

Allowed target areas:

- packages/ts-shell/src/core/shell
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/session
- packages/ts-shell/src/result
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation if created
- packages/ts-shell/src/product-surface if this naming already fits local rules

Choose the rightful owner domain based on existing project layout.

Do not put rendering logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena before implementation.

Inspect current project with targeted symbol and file inspection:

- CLI session product surface
- shell session runtime output
- session terminal state
- runtime event projection
- JSON event stream
- session tree projection
- session context rebuild projection
- execution receipt projection
- tool result split
- tool interception metadata
- provider readiness and provider registry metadata
- package inventory and resource projection
- result and evidence truthfulness surfaces
- agent loop contract events
- any current user-facing output sources

Inspect the local architecture study repository only for targeted comparison if needed:

- message rendering boundary
- terminal section model
- status or footer projection
- tool result rendering
- event to UI adapter
- renderer host separation

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, continue only if targeted repository search is enough, and report that Serena was unavailable.

## Capability to build

### 1. Output source audit

Before implementing, audit current user-visible output sources.

Identify:

- CLI text rendering
- session summary rendering
- terminal state rendering
- runtime event summaries
- result projection wording
- provider readiness display
- tool result display
- verification display if currently visible
- repair display if currently visible
- package and resource display
- debug or audit output that must remain separate

Classify each as:

- fact owner
- view model owner
- renderer owner
- host adapter
- compatibility surface
- historical or debug-only output

Do not move everything blindly.

### 2. Product surface view model

Create or consolidate a product surface view model.

It should be semantic and host-neutral.

Recommended sections:

- task
- context
- plan
- proposal
- authority
- apply
- verification
- repair
- tools
- resources
- provider
- packages
- session
- events
- verdict
- not_proven
- next_action

Each section should include:

- section kind
- title or safe label
- severity
- status
- summary
- facts
- redaction state
- not-proven claims
- source evidence ids if available
- machine event correlation ids if available

The view model is not a verdict owner.

### 3. Terminal message renderer contract

Add a terminal renderer that consumes the product surface view model.

Renderer responsibilities:

- section ordering
- concise human-readable labels
- indentation
- severity markers
- compact versus detailed mode if simple
- redaction markers
- not-proven wording
- next-action wording

Renderer must not decide:

- terminal success
- verification success
- repair success
- authority granted
- provider readiness
- package trust
- tool success
- resource safety

Those must come from the owning domain projections.

### 4. CLI/session host adapter consumption

Update one minimal CLI/session product seam to consume the renderer or view model.

Acceptable seams:

- existing CLI session product surface
- shell session runtime product output
- session terminal state summary

Do not redesign CLI.

Do not build a TUI.

Do not change interactive flow broadly.

### 5. Human and machine consistency

Ensure human output does not contradict runtime event or result facts.

Examples:

- if event says observed, human output cannot say completed
- if package is metadata-only, human output cannot say installed
- if provider requires opt-in, human output cannot say provider ready
- if verification was selected but not run, human output cannot say passed
- if repair was proposed, human output cannot say repaired
- if save point exists, human output cannot say success

### 6. Redaction and vocabulary policy

Rendered output must not include:

- API keys
- provider.env
- auth headers
- raw provider output
- raw oldText
- raw newText
- unredacted command output
- hidden reasoning
- transcript dumps
- unsafe file contents
- external-origin product vocabulary
- route-era process vocabulary in user-facing output

Historical docs are not part of this route.

### 7. Display statuses and severities

Define local status and severity labels.

Recommended severity:

- info
- success
- warning
- blocked
- error
- partial
- not_proven

Recommended statuses:

- observed
- ready
- pending_authority
- blocked
- not_run
- partial
- failed
- passed
- unsupported
- not_proven

Use local project naming if already established.

Do not make label success stronger than evidence.

## Required tests

Add focused tests only.

Test categories:

1. Product surface model
   Builds sections from representative runtime, session, result, provider, tool, package, and not-proven facts.

2. Renderer output
   Renderer produces stable human-readable sections and preserves ordering.

3. Truthfulness
   Observed events, selected verification, repair proposal, resource availability, package trust, tool allow, or save point creation cannot render as success.

4. Redaction
   Rendered output excludes secrets, provider config, raw provider output, raw patch payloads, command output, hidden reasoning, transcript dumps, unsafe file contents, and forbidden product vocabulary.

5. CLI/session adapter
   Existing product seam consumes view model or renderer without becoming fact owner.

6. Machine and human consistency
   Human rendered status agrees with machine event or result status.

7. Compact or detailed mode if implemented
   Compact mode must not hide blocking or not-proven facts.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no new TUI framework
- no renderer plugin system
- no theme package
- no SDK UI
- no RPC UI
- no dynamic plugin execution
- no package loading
- no provider default enablement
- no new real tools
- no command registration
- no edit, verification, browser, or MCP expansion
- no session schema migration
- no broad runtime rewrite
- no new dependencies
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- build a new TUI
- add theme customization
- add renderer extension registration
- add UI widgets
- add interactive command palette
- redesign CLI flow
- rewrite ShellSessionRuntime broadly
- rewrite SessionManager
- alter result truthfulness
- hide not-proven claims for prettier output
- move facts from owner domains into renderer
- create a route runner
- create a verify route script
- create JSON capability reports
- move files to mirror an external project

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI015 is COMPLETE only if:

- targeted inspection was performed and reported
- output source audit is summarized
- product surface view model exists in rightful owner domain
- terminal renderer contract exists
- one CLI/session product seam consumes the view model or renderer
- rendered output preserves redaction rules
- rendered output preserves truthfulness
- machine and human statuses do not contradict each other
- product output avoids external-origin and route-era vocabulary
- no TUI framework or plugin renderer is introduced
- focused tests pass
- build passes
- git diff check passes
- no compatibility shim grows business logic

If this requires broad CLI rewrite or new UI framework, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Output source audit summary
4. Owner domains changed
5. Files changed
6. Product surface view model design
7. Renderer contract design
8. CLI/session adapter consumption
9. Human and machine consistency
10. Redaction behavior
11. Truthfulness behavior
12. Tests and validation pass or fail
13. Architecture constraints preserved
14. What remains deliberately not-proven
15. Recommended next route

## Next route

After BI015 is complete, continue with:

docs/build-infrastructure/route/route-bi016-build-infrastructure-closeout-and-roadmap.md

BI016 should close the initial build-infrastructure sequence, update the route index, summarize completed infrastructure layers, identify remaining deferred patterns, and recommend the next real product feature route.
