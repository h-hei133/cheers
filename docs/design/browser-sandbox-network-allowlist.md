# Browser Sandbox Network Allowlist

Route 97 hardens the Route 96 browser execution seam before any real
Playwright execution is considered. It adds explicit sandbox authority,
network allowlist, confirmation, runtime preflight, and evidence policy
surfaces while preserving non-real-execution behavior.

## Reference Scan

Budget used: 13 files. Optional E2B, Daytona, and browser-use repositories
were not present.

Stagehand:

- `packages/docs/v2/references/act.mdx`
- `packages/docs/v2/references/observe.mdx`
- `packages/docs/v2/references/extract.mdx`
- `packages/core/tests/unit/safety-confirmation.test.ts`
- `packages/core/tests/unit/snapshot-capture-orchestration.test.ts`

Stagehand separates act/observe/extract and has explicit safety-confirmation
coverage plus snapshot capture boundaries. Local implication: confirmation and
evidence requirements should be modeled before execution and should not expose
raw page content.

Playwright MCP:

- `src/README.md`
- `tests/click.spec.ts`
- `tests/capabilities.spec.ts`

Playwright MCP exposes named browser tools and snapshot evidence. Local
implication: this repo should keep browser action capability, network target,
and evidence shape explicit, and should not launch an MCP server in the
sandbox-hardening route.

OpenHands:

- `frontend/src/types/v1/core/openhands-event.ts`
- `frontend/src/types/v1/core/events/action-event.ts`
- `frontend/src/types/v1/core/events/observation-event.ts`

OpenHands separates action events from observations and carries tool ids,
tool names, summaries, and error surfaces. Local implication: browser
preflight should produce user-visible blocked/allowed status without raw tool
payloads or hidden reasoning fields.

Inspect AI and mini-swe-agent:

- `src/inspect_ai/_eval/task/run.py`
- `src/inspect_ai/scorer/_scorer.py`
- `src/minisweagent/agents/default.py`

Inspect AI separates sandbox/task orchestration from scorer assertions.
mini-swe-agent keeps execution and trajectory evidence compact. Local
implication: preflight and scenario harness checks should be deterministic,
assertion-friendly, and separate from real runtime execution.

## Route 96 Baseline

Route 96 added `/browser execute navigate|observe|extract`, a non-default
executor interface, noop/fake executors, a Playwright CLI plan-only adapter,
execution result/surface, sidebar events, and scenario harness coverage.
Default execution is blocked when no executor is injected.

Route 97 keeps that seam but requires runtime preflight before any executor is
called.

## Sandbox Authority

`BrowserSandboxAuthority` is the route-scoped authority object for browser
execution. Modes:

- `disabled`: default; blocks execution
- `dry-run-only`: blocks execution and records preview-only intent
- `fake-test`: allows fake/test executor for navigation, observe, and extract
- `explicit-local`: represented but not executable in this route
- `future-runtime`: represented but not executable in this route

Capabilities are explicit: navigation, observe, extract, click, type,
screenshot, upload, download, auth, payment, and destructive. Auth, payment,
destructive, upload, download, and screenshot remain blocked.

## Network Allowlist

The initial allowlist is default-deny:

- only explicitly listed https origins can pass
- `file:`, `data:`, `javascript:`, `about:`, `chrome:`, and extension-like
  schemes are blocked
- credential URLs are blocked
- localhost and private-network targets are blocked by default
- no DNS, fetch, browser navigation, or network probe is performed

Read-only observe/extract actions do not introduce a new navigation target and
therefore can pass the network gate when sandbox authority allows them.

## Confirmation Policy

Confirmation is represented as data only. Route 97 adds no prompt UI.

- navigate requires network confirmation before fake/test execution can run
- click/type require state-changing confirmation and still do not execute here
- observe/extract do not require confirmation when read-only gates pass
- sensitive actions are denied

## Runtime Preflight

`BrowserRuntimePreflight` consumes:

- execution request and existing execution policy
- sandbox authority
- network allowlist
- confirmation records
- executor kind
- Playwright CLI plan-only adapter evidence
- evidence policy

It returns pass/blocked/warning/future-runtime-required status, blockers,
warnings, required confirmations, sandbox/network/confirmation decisions,
evidence requirements, next action, and deterministic evidence. A blocked
preflight prevents executor invocation.

## Evidence Policy

Future real execution must produce compact, redacted evidence:

- action request id
- runtime/backend
- target URL/origin for navigation
- allowlist decision
- sandbox decision
- confirmation decision
- accessibility snapshot summary reference
- selected element evidence
- extraction schema/result summary
- action trace summary
- stderr/stdout summary if a CLI is used
- redactions
- executed yes/no

Fake/test evidence must be clearly labeled fake/test. Raw browser content,
screenshots/OCR capture, secrets, provider credentials, hidden reasoning, and
raw content blobs remain disallowed.

## Sidebar And Status Surface

`/browser execute ...` now appends a `Browser sandbox preflight` section to the
execution surface. Sidebar event summaries can include sanitized preflight
status, sandbox authority, network allowlist, confirmation status, evidence
requirements, blockers/warnings, and `Executed: yes/no`.

No sidebar schema, persistence, dynamic discovery, provider/model call, MCP
launch, or raw event payload rendering is added.

## Scenario Harness Coverage

Route 97 adds scenario coverage for:

- missing sandbox authority blocks execution
- missing network allowlist blocks navigation
- fake/test execution can run only with fake authority, allowlisted origin, and
  represented network confirmation
- dry-run continues to show sandbox requirements without execution

The harness still treats real browser execution claims as unsafe unless the
scenario explicitly marks fake/test execution.

## No-Real-Execution Boundary

Route 97 does not:

- launch a browser or Playwright process
- launch or discover MCP servers
- make network requests
- persist browser sessions
- call providers or models
- change package scripts or default gates
- change SessionManager schema
- change edit runtime, recovery, rollback, memory persistence, or startup
  injection
- allow auth, payment, destructive actions, upload/download, or screenshot/OCR
- expose raw content, secrets, provider credentials, hidden reasoning, or raw
  browser blobs

## Route 98 Recommendation

Choose Route 98 Playwright CLI real execution opt-in only if the preflight
gates remain stable and a real browser lifecycle can be isolated.

Choose Route 98 real CLI scenario harness if process-spawn evidence should be
proven before browser launch.

Choose Route 98 browser sandbox lifecycle hardening if allowlist,
confirmation, cleanup, or status surfaces need more polish first.

## Route 98 Real CLI Scenario Note

Route 98 chooses the real CLI scenario harness path. It proves browser dry-run
and blocked execute output through a child process while preserving the Route
97 preflight boundary: no real browser launch, no network access, no
Playwright/MCP launch, no provider/model call, and no raw browser content in
reports.

## Route 99 Local Fixture Execution Note

Route 99 adds local-fixture sandbox authority and a non-default local fixture
executor. Read-only observe/extract can execute only when the executor and
local-fixture authority are injected. External navigation remains blocked by
the allowlist/preflight path; no external network, MCP launch, persistent
browser session, provider/model call, or raw browser content is added.

## Route 100 CLI Manifest Bridge Note

Route 100 lets the real CLI harness inject that same local-fixture authority
through a validated temp manifest. The manifest may list only
`local-fixture://` origins and read-only local fixture actions. External URL
navigation still blocks through existing preflight and confirmation gates, and
the bridge adds no real browser process, MCP launch, network access,
provider/model call, persistence, or raw browser content.

## Route 101 Playwright Local Note

Route 101 lets `playwright-local` share the local-fixture sandbox and
`local-fixture://` navigation exception. HTTP/HTTPS targets remain blocked by
the existing default-deny allowlist. The route adds no external network, MCP
launch, persistent browser session, auth/payment/destructive/upload/download
actions, screenshot/OCR, or raw browser content.

## Route 102 Dependency Policy Note

Route 102 keeps the same network boundary while adding dependency and external
runner policy surfaces. The chosen policy is external-runner-only; package
dependency and browser binary install remain deferred. External runner config
is allowed only when its allowlist is `none` and its scope is
local-fixture-only.

## Route 103 External Runner Bridge Note

Route 103 lets `test-local` and `external-local` modes share the
`local-fixture://` navigation exception, but only through a validated external
runner manifest. HTTP/HTTPS targets remain blocked by the existing
default-deny allowlist, so the bridge adds no external-network browsing.

## Route 104 Evidence Receipt Note

Route 104 records sandbox, allowlist, and confirmation decisions in browser
execution receipts and uses them for replay-readiness classification.
HTTP/HTTPS targets remain blocked, replay is not executed, and no new network,
MCP, provider/model, persistence, or raw evidence surface is added.
