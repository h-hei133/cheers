# Public Read-Only Web Smoke And Report Polish

Status: Route 121 implemented candidate.
Date: 2026-05-18

## Scope

Route 121 adds an opt-in public read-only smoke harness and improves the
public read-only report surface. It builds on Route 120 and does not expand
the runtime beyond explicit HTTPS `GET`/`HEAD` evidence.

The smoke harness is disabled by default. Default validation must not access
the public internet.

## Reference Scan

Files inspected: 6 directly relevant files.

- `/home/wang/projects/playwright-mcp/README.md`
- `/home/wang/projects/OpenHands/openhands/app_server/services/httpx_client_injector.py`
- `/home/wang/projects/stagehand/packages/core/lib/v3/understudy/networkManager.ts`
- `/home/wang/projects/inspect_ai/src/inspect_ai/_eval/task/run.py`
- `/home/wang/projects/mini-swe-agent/docs/usage/output_files.md`
- Route 120 public read-only runner modules

Findings:

1. Playwright MCP marks network/snapshot tools as read-only but keeps unsafe
   code execution and browser actions separate. Local implication: smoke
   output should state what was not done: no browser launch, JavaScript,
   auth/cookies, write action, or raw persistence.
2. OpenHands injects HTTP clients explicitly. Local implication: default tests
   use injected clients, while real public smoke uses only explicit env.
3. Stagehand centralizes lifecycle records. Local implication: smoke results
   should report skipped, executed, blocked, and unavailable as lifecycle
   states instead of throwing flaky default failures.
4. Inspect AI and mini-swe-agent preserve concise run metadata and terminal
   summaries. Local implication: reports show status, target origin, method,
   evidence summary, redactions/warnings, and next action without raw content.

## Opt-In Smoke Policy

The smoke proves only that the Route 120 public read-only runner can perform a
bounded real public `GET` or `HEAD` when all explicit gates are present:

- smoke env enabled
- exact HTTPS URL supplied
- method is `HEAD` or `GET`
- bounded timeout and byte budget
- manifest, allowlist, and confirmation are created from the explicit config
- Route 119 egress guard and redirect checks still run

It reports skipped when disabled, blocked for unsafe config/policy failures,
unavailable for client/network failures, and executed only after a safe
read-only receipt is produced.

## Env / Config

- `CHEERS_ENABLE_PUBLIC_WEB_SMOKE=1`
- `CHEERS_PUBLIC_WEB_SMOKE_URL=<https-url>`
- `CHEERS_PUBLIC_WEB_SMOKE_METHOD=HEAD|GET` defaults to `HEAD`
- `CHEERS_PUBLIC_WEB_SMOKE_TIMEOUT_MS=<bounded-ms>`
- `CHEERS_PUBLIC_WEB_SMOKE_BYTE_BUDGET=<bounded-bytes>`

The config parser never performs network calls. It rejects missing URLs when
enabled, non-HTTPS URLs, credential URLs, private/local network URLs, and
unsupported methods.

## UX Output

Public read-only output should show:

- what was requested
- what gates allowed or blocked it
- whether public network was used
- what sanitized evidence was collected
- what was not done
- next action

Reports must hide raw page content, cookies, headers, URL credentials,
secrets, hidden reasoning, binary bodies, screenshots, OCR payloads, and file
downloads.

## Route 122

Route 122 should own operator documentation/manual run recipes for the opt-in
smoke, or read-only extraction quality/ranking. Browser automation, JavaScript,
cookies/auth, screenshots, and write actions should remain separate design
work only after the HTTP read-only path stays stable.
