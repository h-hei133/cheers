# Build Infrastructure Route BI011: Provider Model Registry And Compatibility

## Goal

Implement the next Pi-inspired build-infrastructure route after BI010.

BI005 added static resource descriptors.
BI007 added extension lifecycle and hook boundary.
BI009 added host-neutral runtime API and JSON-safe event stream.
BI010 added a local agent loop reference kernel.

BI011 must now build the provider and model registry architecture needed by a clean agent runtime.

Target capabilities:

- provider descriptor contract
- model descriptor contract
- model compatibility flags
- provider failure taxonomy alignment
- fallback policy metadata
- per-request auth contract
- provider registry projection into runtime resources and events
- safe integration with provider prompt and live-provider readiness surfaces

Expected final status: COMPLETE.

This is architecture infrastructure work. It must not default-enable live provider or change provider execution behavior broadly.

## Why this route exists

Pi supports custom models and providers through a registry-like architecture, model compatibility flags, provider adapters, custom provider registration, and per-request auth or endpoint behavior.

This project already has working live provider paths, provider readiness, fallback environment support, and safe provider boundaries. But the provider architecture is still too implementation-specific.

BI011 should make provider and model capabilities explicit, report-safe, and registry-driven without changing runtime safety.

## Owner domains

Primary owners:

- provider
- runtime/resources
- runtime/events
- policy
- evidence
- result

Secondary owners only if needed:

- runtime/loop for model boundary metadata
- cli or core/shell for minimal display
- planning only for safe provider capability awareness

Allowed target areas:

- packages/ts-shell/src/provider
- packages/ts-shell/src/runtime/resources
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/policy
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/runtime/loop only for boundary metadata
- packages/ts-shell/src/core/shell only for minimal display

Do not put provider registry logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol and file inspection:

- providerDraftStage
- providerFetch
- providerReadiness
- provider configuration loading boundaries
- contextAwareProviderPrompt
- planningRuntimeProductProposal
- live provider opt-in gates
- fallback provider policy
- static resource descriptor from BI005
- extension lifecycle placeholders from BI007
- runtime events from BI004 and BI009
- agent loop reference model from BI010
- evidence and result truthfulness surfaces

Inspect Pi reference repo with Serena:

- model registry
- custom model definitions
- provider registry
- custom provider registration
- provider adapter contract
- model compatibility flags
- per-request auth or endpoint behavior
- provider request lifecycle
- provider failure handling if present

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Provider descriptor contract

Define a report-safe provider descriptor.

Recommended fields:

- provider id
- safe label
- provider kind
- endpoint class
- auth mode
- default enabled flag
- requires explicit opt-in flag
- supports fallback flag
- supports streaming flag if known
- supports tool calls flag if known
- supports structured output flag if known
- supports custom headers flag if known
- risk level
- redaction policy
- not-proven claims

The descriptor must not include:

- API keys
- provider.env contents
- auth headers
- private config paths unless already redacted by existing policy
- raw base URL if local policy treats it as private
- raw provider output
- prompt payloads
- oldText or newText

Provider descriptor existence must not enable provider execution.

### 2. Model descriptor contract

Define a report-safe model descriptor.

Recommended fields:

- model id or safe model label
- provider id
- family or compatibility family
- context window if safely known
- supports developer role
- supports system role
- supports tool calls
- supports parallel tool calls
- supports structured JSON output
- supports reasoning effort
- supports streaming
- supports stop sequences
- supports temperature
- supports seed
- known limitations
- not-proven claims

Unknown capabilities must be explicit unknown or not-proven, not guessed.

### 3. Compatibility flags

Add a compatibility flag model that can be used by provider prompt and request preparation later.

Initial flags may include:

- developer role support
- tool call support
- JSON response support
- streaming support
- reasoning effort support
- parallel tool call support
- strict message role support
- OpenAI-compatible shape
- provider-specific quirks

Do not use flags to silently change prompt or provider behavior unless the existing provider path already does that safely.

This route may expose flags as metadata and add minimal safe consumption.

### 4. Provider failure taxonomy alignment

Align provider failure classes with existing failure handling.

Recommended classes:

- provider_config
- provider_auth
- provider_network
- provider_endpoint
- provider_rate_limited
- provider_timeout
- provider_output_invalid
- provider_output_insufficient
- provider_redaction_failure
- provider_route_error
- provider_unknown

Do not collapse auth, network, endpoint, invalid output, and route bugs into one class.

Exit code zero must not erase provider failure class.

### 5. Fallback policy metadata

Represent fallback eligibility as metadata.

Fallback metadata should record:

- fallback provider id
- eligible failure classes
- ineligible failure classes
- max attempts
- retry relation
- explicit opt-in requirement
- redaction policy
- not-proven claims

Fallback must not be attempted by default because registry metadata exists.

This route should not increase live provider call count unless existing tests already use fake provider seams.

### 6. Per-request auth contract

Define a per-request auth contract or projection.

It should describe:

- auth source kind
- auth resolution status
- redaction status
- missing auth class
- safe provider identity
- request correlation id if available
- not-proven claims

It must not expose secrets.

Do not manually parse provider.env.

Do not print provider.env.

Do not change approved provider loading path except for safe metadata projection.

### 7. Runtime resource and event integration

Integrate provider and model registry metadata with BI005 resources and BI009 events.

Minimum integration:

- provider and model descriptors can be projected as static resources or registry projection
- runtime events can observe provider registry projection or provider readiness projection
- provider metadata remains observation-only
- terminalSuccessClaim remains false
- not-proven claims are preserved

### 8. Product seam consumption

Add one minimal product seam that can consume safe provider registry metadata.

Acceptable seams:

- provider readiness surface
- planning provider capability awareness
- CLI/session display summary
- runtime event projection
- provider prompt preparation metadata only if behavior does not change unsafely

Do not make registry metadata execute provider.

## Required tests

Add focused tests only.

Test categories:

1. Provider descriptor redaction
   Provider descriptors reject or redact secrets, provider.env contents, auth headers, raw output, and unsafe paths.

2. Model compatibility flags
   Unknown model capabilities remain unknown or not-proven.

3. Failure taxonomy
   Auth, network, endpoint, invalid output, output-insufficient, redaction failure, and route error classify distinctly.

4. Fallback metadata
   Fallback eligibility is represented, but does not execute fallback by itself.

5. Per-request auth projection
   Auth status is report-safe and does not expose secret material.

6. Runtime resource and event integration
   Provider/model registry metadata can be projected through resource or runtime event surfaces without success claim.

7. Truthfulness
   Provider descriptor, model descriptor, provider readiness, or registry projection cannot become provider success, proposal success, verification success, or terminal success.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no provider default enablement
- no provider.env manual read
- no secret printing
- no live provider calls unless existing approved test seam requires it
- no edit, verification, browser, MCP, or tool execution expansion
- no dynamic plugin execution
- no package loading
- no new dependencies
- no session schema migration
- no broad runtime rewrite
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- enable providers by default
- call real provider unless explicitly necessary and already approved by existing project gate
- read provider.env manually
- print provider config or secrets
- create a route runner
- create a verify route script
- create JSON capability reports
- implement provider plugin execution
- implement dynamic provider registration from external package
- implement SDK or RPC provider API
- change provider prompt behavior broadly
- change fallback execution policy broadly
- move files just to look like Pi

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI011 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- provider descriptor contract exists in proper owner domain
- model descriptor contract exists in proper owner domain
- compatibility flags are represented with unknown and not-proven states
- provider failure taxonomy is aligned or improved
- fallback policy metadata exists without executing fallback by itself
- per-request auth projection exists without secret exposure
- provider/model registry metadata integrates with resource or runtime event projection
- one product seam consumes safe provider metadata
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff --check passes
- no provider default enablement occurs
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires live provider behavior rewrite or external provider plugin loading, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Pi provider/model registry findings
6. Provider descriptor design
7. Model descriptor design
8. Compatibility flags
9. Provider failure taxonomy
10. Fallback metadata
11. Per-request auth projection
12. Resource and event integration
13. Product seam consumption
14. Redaction behavior
15. Truthfulness behavior
16. Tests and validation pass or fail
17. Architecture constraints preserved
18. What remains deliberately not-proven
19. Recommended next route

## Next route

After BI011 is complete, continue with:

docs/build-infrastructure/route/route-bi012-tool-hook-permission-interception.md

BI012 should address tool hook permission interception, before-tool policy, after-tool result annotation, ExecutionService authority integration, and hook truthfulness without adding real new tools or bypassing the result layer.
