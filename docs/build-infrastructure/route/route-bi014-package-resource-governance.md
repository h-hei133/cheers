# Build Infrastructure Route BI014: Package Resource Governance

## Goal

Implement the next build-infrastructure route after BI013.

BI005 added static resource descriptors.
BI007 added safe extension lifecycle and hook metadata.
BI011 added provider and model registry metadata.
BI013 added tool interception policy metadata.

BI014 must add package and resource governance without package installation, dynamic loading, plugin execution, or resource discovery expansion.

Target capabilities:

- package manifest contract
- resource inventory projection
- resource scope model
- trust and source policy
- version and pinning metadata
- enablement and disablement metadata
- conflict and precedence projection
- audit-safe package inventory display
- explicit not-proven claims for install, load, execute, and trust verification

Expected final status: COMPLETE.

This route is governance infrastructure work. It must not implement package installation or dynamic resource loading.

## Why this route exists

The project now has static resources and metadata-only extension manifests, but no governance layer.

A serious agent runtime needs to answer:

- where did a resource come from
- is it project, user, built-in, or external
- is it enabled
- what permissions would it require
- what version is pinned
- what capabilities it claims
- whether the resource is trusted, untrusted, blocked, or unknown
- whether conflicts exist
- whether a resource is metadata-only or executable

BI014 adds those answers as report-safe metadata only.

## Owner domains

Primary owners:

- runtime/resources
- policy
- evidence
- result

Secondary owners only if needed:

- provider for provider resource metadata linkage
- runtime/events for package inventory observations
- core/shell for minimal display

Allowed target areas:

- packages/ts-shell/src/runtime/resources
- packages/ts-shell/src/policy
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/provider only for metadata linkage
- packages/ts-shell/src/runtime/events only for observation projection
- packages/ts-shell/src/core/shell only for minimal display

Do not put package governance logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena before implementation.

Inspect current project with targeted symbol and file inspection:

- runtime/resources static descriptors and projections
- extension manifest metadata from runtime resources
- provider registry metadata
- tool interception policy metadata
- runtime event projection
- policy modules
- evidence and result truthfulness surfaces
- CLI/session product surface only if display is needed
- package scripts only to ensure no new package commands are added

Inspect the local architecture study repository with targeted inspection:

- package manifest shape
- package manager surfaces
- package resource loading
- enabled or disabled package behavior
- extension and skill packaging
- trust warnings or security notes
- resource precedence and scoping if present
- installation or local path handling

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, continue only if targeted repository search is enough, and report that Serena was unavailable.

## Capability to build

### 1. Package manifest contract

Add a report-safe package manifest contract.

Recommended fields:

- package id
- safe name
- version
- source kind
- source label
- scope
- trust level
- enabled state
- pinned state
- resource ids
- declared capabilities
- required permissions
- executable flag
- supported flag
- redaction status
- not-proven claims

The manifest must not include:

- secrets
- auth tokens
- provider config
- raw provider output
- executable code
- arbitrary file contents
- install scripts
- unsafe paths
- hidden reasoning

### 2. Resource scope model

Add a scope model for package and resource metadata.

Recommended scopes:

- built_in
- workspace
- project
- user
- session
- test_fixture
- unknown

The scope model is metadata only.

It must not load resources from those scopes.

### 3. Trust and source policy

Add a trust policy projection.

Recommended trust states:

- trusted
- user_approved
- project_declared
- untrusted
- blocked
- unknown

Trust metadata must not imply code safety.

Trust metadata must not execute, install, enable, or load a package.

### 4. Version and pinning metadata

Add version and pinning fields.

Represent:

- exact version
- version range if needed
- pinned or not pinned
- lock source if safely known
- integrity metadata placeholder if safe
- not-proven claims when integrity is absent

Do not implement package resolution or downloading.

### 5. Enablement and disablement metadata

Represent enablement as a policy fact:

- enabled
- disabled
- blocked
- requires approval
- unsupported
- unknown

Enablement metadata must not activate execution.

A disabled or blocked package must stay inert.

### 6. Conflict and precedence projection

Add a projection that can report resource conflicts.

Examples:

- duplicate resource ids
- same capability declared by multiple packages
- disabled package with enabled resource
- blocked package with available manifest
- unknown trust with executable flag

Do not resolve conflicts by loading code.

Only report conflict facts and policy suggestions.

### 7. Static inventory projection

Add a package inventory projection that accepts explicit static inputs.

Rules:

- no filesystem scan by default
- no package loading
- no package installation
- no network lookup
- no dynamic discovery
- no plugin execution
- no script execution

The inventory can be used by runtime event projection or CLI/session display as observation-only metadata.

### 8. Runtime event and product display integration

If useful, expose inventory projection as runtime event observation or CLI/session safe summary.

Events and display must make clear:

- packages are metadata
- resources were not executed
- package install was not performed
- package trust is not proof of safety
- resource availability is not task success

## Required tests

Add focused tests only.

Test categories:

1. Manifest validation
   Valid manifests are accepted and unsafe fields are rejected or redacted.

2. Scope and trust policy
   Scope and trust are represented without enabling loading or execution.

3. Pinning metadata
   Pinned and unpinned states are represented with not-proven integrity claims where appropriate.

4. Enablement metadata
   enabled, disabled, blocked, requires approval, unsupported, and unknown are represented without execution.

5. Conflict projection
   duplicate ids and unsafe combinations are reported.

6. No dynamic loading
   inventory projection does not scan filesystem, load packages, run scripts, or execute plugins.

7. Runtime event or display integration
   inventory metadata can be observed safely.

8. Truthfulness
   package availability, trust, or enablement cannot become provider success, tool success, verification success, or terminal success.

9. Redaction
   no secrets, provider config, raw provider output, raw patch payloads, command output, hidden reasoning, transcript dumps, or unsafe file contents.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process or origin words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no package installation
- no package loading
- no dynamic resource discovery
- no plugin execution
- no script execution
- no provider default enablement
- no new real tools
- no command registration
- no renderer registry
- no edit, verification, browser, or MCP expansion
- no command allowlist broadening
- no session schema migration
- no broad runtime rewrite
- no new dependencies
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- install packages
- load external packages
- scan package directories by default
- execute package code
- execute extension code
- enable skills or prompts dynamically
- enable provider from package metadata
- add package manager commands
- add package scripts
- add renderer behavior
- change tool or provider execution
- migrate session storage
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

BI014 is COMPLETE only if:

- targeted inspection was performed and reported
- package manifest contract exists in rightful owner domain
- resource scope model exists
- trust and source policy projection exists
- version and pinning metadata exists
- enablement and disablement metadata exists
- conflict and precedence projection exists
- static inventory projection exists without dynamic loading
- runtime event or product display integration exists if safe
- package availability cannot manufacture terminal success
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires package installation, dynamic loading, or plugin execution, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Package manifest contract
6. Scope and trust policy
7. Version and pinning metadata
8. Enablement metadata
9. Conflict and precedence projection
10. Static inventory projection
11. Runtime event or display integration
12. Redaction behavior
13. Truthfulness behavior
14. Tests and validation pass or fail
15. Architecture constraints preserved
16. What remains deliberately not-proven
17. Recommended next route

## Next route

After BI014 is complete, continue with:

docs/build-infrastructure/route/route-bi015-ui-rendering-message-boundary.md

BI015 should address UI rendering, message renderer boundaries, semantic terminal sections, status projections, and host display contracts without adopting a new UI framework.
