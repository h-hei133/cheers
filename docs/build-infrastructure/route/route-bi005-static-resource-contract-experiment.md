# Build Infrastructure Route BI005: Static Resource Contract Experiment

## Goal

Implement the final Pi-inspired build-infrastructure route from the BI001 roadmap.

BI002 introduced frozen turn snapshots, runtime phases, and save points.
BI003 introduced execution taxonomy, execution receipts, and tool result content/details split.
BI004 introduced schema-neutral session projection and host-neutral runtime event projection.

BI005 must now add a static resource contract experiment for:

- skills
- prompt templates
- provider metadata
- extension-like manifests
- resource projection into runtime context

This route is an experiment in resource contracts, not a dynamic plugin system.

Expected final status: COMPLETE.

## Why this route exists

Pi keeps the core small and externalizes workflow through resources such as skills, prompt templates, packages, custom providers, and extensions.

This project should learn from that pattern, but must not copy Pi blindly or reintroduce architecture problems.

The safe next step is a static contract layer:

- no dynamic discovery by default
- no plugin execution
- no package loading
- no arbitrary code loading
- no provider default enablement
- no runtime side effects from resources
- no route-era resource files

The resource contract should describe resources and make them visible to runtime planning or CLI/session surfaces in a report-safe way.

## Owner domains

Primary owners:

- runtime/resources if created
- provider
- planning
- context
- cli only for minimal display
- evidence or result only for report-safe projection

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/resources
- packages/ts-shell/src/provider
- packages/ts-shell/src/planning
- packages/ts-shell/src/context
- packages/ts-shell/src/cli or core/shell only if display is needed
- packages/ts-shell/src/evidence or result only for safe projection

Do not put resource logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- provider metadata or provider registry surfaces
- prompt or system prompt construction surfaces
- context and planning resource inputs
- runtime turn snapshot and event projection from BI002 and BI004
- CLI/session product surface if display is needed
- agent-rules and architecture rules only as constraints, not product code

Inspect Pi reference repo only for targeted comparison:

- skills
- prompt templates
- resource loading
- extension manifest or package metadata
- custom provider metadata
- system prompt resource exposure
- runtime resource injection

Do not broad dump either repo.

Record inspected symbols/files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Static resource descriptor contract

Create a product-owned resource descriptor type.

It should support safe metadata for:

- skill-like resource
- prompt-template-like resource
- provider metadata resource
- extension-like manifest
- package-like grouping metadata if useful

Recommended safe fields:

- id
- kind
- name
- description
- source type
- version if available
- owner domain
- visibility
- enabled by default flag
- requires opt-in flag
- capabilities summary
- risk level
- report-safe metadata
- not-proven claims

Do not include executable code.

Do not include secrets.

Do not include raw prompt contents unless explicitly safe and intended.

### 2. Static resource registry

Add a static registry or projection layer.

Rules:

- registry is explicit, not dynamic discovery
- no filesystem scanning by default
- no package loading
- no extension execution
- no network lookup
- no model/provider auth resolution
- no side effects
- test fixtures must be marked as fixtures or static examples

This route may define a small in-memory static example set for tests.

### 3. Resource projection into runtime context

Allow runtime or planning to receive a safe resource summary.

The projection may include:

- available resource ids
- resource kind
- short description
- opt-in requirements
- risk labels
- provider metadata safe label
- not-proven claims

It must not directly change provider, tool, edit, verification, or session behavior.

It must not auto-load skills or prompt templates into model context unless the resource is explicitly safe and the current architecture already supports it.

### 4. Provider metadata resource

Represent provider metadata safely.

Allowed:

- provider safe label
- model safe label
- capability flags
- endpoint class if already safe
- opt-in requirement
- default disabled status

Not allowed:

- API keys
- provider.env contents
- raw base URL if local policy treats it as private
- auth headers
- private config paths beyond existing redaction policy

Provider metadata must not enable provider by default.

### 5. Extension-like manifest experiment

Create a manifest contract only.

It may describe:

- extension id
- safe name
- capabilities
- tool kinds it might provide
- permissions it would require
- whether it is executable
- whether it is currently supported

For now, executable extension loading must remain unsupported or not-proven.

No plugin execution in this route.

### 6. Evidence and CLI/session projection

If useful, expose static resource metadata through runtime event or CLI/session surface.

It must be clear that:

- resource exists as metadata
- resource was not executed
- resource was not dynamically discovered unless explicitly stated
- resource availability is not task success

## Required tests

Add focused tests only.

Test categories:

1. Static descriptor validation
   Valid resource descriptors are accepted and unsafe descriptors are rejected or redacted.

2. No dynamic execution
   Extension-like manifests do not execute code.

3. Provider redaction
   Provider metadata projection does not leak provider.env, API keys, auth headers, raw private config, or raw provider output.

4. Runtime projection
   Resource summaries can be passed to runtime or planning as metadata without changing behavior.

5. Truthfulness
   Resource availability does not become task success, provider success, tool success, or verification success.

6. Product integration
   One local product seam can consume or display resource metadata safely.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no dynamic discovery by default
- no plugin execution
- no package loading
- no provider default enablement
- no new tool execution
- no edit, verification, browser, or MCP expansion
- no session schema migration
- no broad runtime rewrite
- no Python runtime
- no contracts business logic
- no side effects outside ExecutionService or sanctioned owner
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- create a route runner
- create a verify route script
- create JSON capability reports
- copy Pi resource file layout directly
- implement full extension loading
- implement dynamic skill discovery
- implement package installation
- execute extension code
- enable provider from resource metadata
- insert arbitrary prompt files into model context
- add network discovery
- add new dependencies
- migrate session storage
- redesign CLI
- move files just to look like Pi

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI005 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- a static resource descriptor contract exists in the proper owner domain
- static resource projection or registry exists without dynamic discovery
- provider metadata can be represented safely without enabling provider
- extension-like manifest is metadata-only and cannot execute
- at least one runtime, planning, or CLI/session product seam can consume safe resource metadata
- unsafe resource metadata is rejected or redacted
- resource availability does not imply task success
- focused tests pass
- build passes
- git diff --check passes
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires dynamic resource loading or plugin execution, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Static resource descriptor design
6. Static registry or projection design
7. Provider metadata redaction behavior
8. Extension-like manifest behavior
9. Runtime or planning integration
10. CLI/session display behavior if touched
11. Truthfulness behavior
12. Tests and validation pass/fail
13. Architecture constraints preserved
14. What remains deliberately not-proven
15. Recommended post-BI priorities

## No next route

BI005 is the final route in the initial Pi-inspired build-infrastructure sequence.

After BI005, stop and report the build-infrastructure state before starting implementation routes for real agent features.
