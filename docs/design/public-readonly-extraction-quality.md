# Public Read-Only Extraction Quality

Status: Route 122 implemented candidate.
Date: 2026-05-18

## Scope

Route 122 improves the usefulness of Route 120/121 public read-only HTTP
evidence after a request has already passed manifest, allowlist, confirmation,
and egress checks.

This is post-processing only. It adds no crawling, browser launch, JavaScript,
cookies/auth/session state, write methods, provider/model calls, MCP launch,
package changes, startup cache, or raw page persistence.

## Reference Scan

Files inspected: 5 directly relevant references plus current Route 120/121
modules.

- `/home/wang/projects/playwright-mcp/README.md`
- `/home/wang/projects/stagehand/claude.md`
- `/home/wang/projects/OpenHands/frontend/src/components/v1/chat/event-content-helpers/get-observation-content.ts`
- `/home/wang/projects/OpenHands/frontend/src/types/v1/core/base/observation.ts`
- `/home/wang/projects/inspect_ai/CHANGELOG.md`
- `/home/wang/projects/mini-swe-agent/src/minisweagent/agents/default.py`

Findings:

1. Playwright MCP treats page snapshots as read-only, structured observation.
   Local implication: extraction should return bounded structured evidence,
   not raw body dumps.
2. Stagehand separates `observe`, `extract`, and action execution. Local
   implication: link discovery is evidence only; it must not fetch links or
   become an action plan.
3. OpenHands renders browser observations as bounded text with truncation and
   keeps screenshot data structurally separate. Local implication: public
   read-only extraction should report bounded text evidence and keep raw/binary
   content out of the user-facing summary.
4. Inspect AI emphasizes concise status and score surfaces. Local implication:
   extraction quality should be a short status/score with reasons.
5. mini-swe-agent records bounded trajectories and exit status. Local
   implication: reports should preserve concise evidence and lifecycle status
   without raw transcript or content expansion.

## Extraction Return

Beyond HTTP status, public read-only extraction now returns:

- content class: `html`, `plain-text`, `json-summary`, `unsupported`,
  `binary-blocked`, or `over-budget`
- sanitized title, canonical URL summary, and meta description when HTML
- bounded heading, snippet, and link summaries
- extraction completeness and quality score
- ranked evidence blocks
- redactions and warnings

The response body remains transient input to the normalizer. Receipts, reports,
sidebar summaries, and command output expose only sanitized summaries.

## Content Policy

HTML strips scripts, styles, noscript blocks, comments, and markup before
snippet generation. Plain text is whitespace-normalized. JSON is summarized by
bounded keys and primitive values rather than exposed as a raw object.

Binary/blob-like content is blocked. Unsupported types remain unsupported.
Over-budget content is reported as budget-limited; raw over-budget body content
is not exposed.

## Ranking Policy

Ranked evidence orders title/meta first, then headings, snippets, safe links,
warnings, and redactions. Ranking never infers facts beyond extracted text,
never fetches linked pages, and never hides warnings.

Links are summaries only. They are not crawl targets, not follow-up network
permission, and not automatic citations.

## UX / Report Model

Command, receipt, smoke, sidebar, and public read-only surfaces show:

- extraction quality status and score
- top ranked snippets
- safe link summaries
- redactions/warnings
- what was not done: browser, JavaScript, crawling, auth/cookies, writes

## Still Blocked

Browser automation, JavaScript-derived DOM state, screenshots/OCR, forms,
downloads/uploads, authenticated pages, cookie/session handling, crawling, and
source quote budget discipline remain outside Route 122.

## Route 123

Recommended Route 123: public read-only source citation and quote budget
discipline. A narrower alternative is public read-only extraction CLI UX polish
after the quality model remains stable.
