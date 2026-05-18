# Route 122: public read-only extraction quality and ranking

## Goal

Improve public read-only web extraction quality and ranking after Route 121.

Route 120 added explicit public read-only web execution.
Route 121 added opt-in smoke harness and UX/report polish.

Current capability can safely fetch read-only HTTP evidence, but extraction quality is still minimal. Route 122 should make public read-only output more useful without expanding browser/network authority.

Target improvements:

- content-type aware extraction
- safe HTML/text normalization
- title / canonical / heading extraction
- main-text candidate extraction
- safe snippet generation
- link summary with strict budget
- extraction quality score
- ranked evidence blocks
- concise user-facing extraction summary
- report/sidebar summaries that explain what was read

This route must not add crawling, browser automation, JavaScript, cookies, auth, write methods, or raw page persistence.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/public-readonly-extraction-quality.md
- docs/design/edit-capability-roadmap.md: concise Route 122 note only

Do not append Route 122 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-public-readonly-web-runner.md
- docs/design/public-readonly-web-smoke-and-report-polish.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- public read-only GET/HEAD runner exists
- default validation does not access public internet
- smoke harness is opt-in and skipped by default
- evidence is sanitized and budgeted
- browser launch, JS, cookies/auth, POST/write actions remain blocked
- extraction/ranking is still basic

## Reference scan

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands
- Stagehand: /home/wang/projects/stagehand

Harness/report references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Playwright MCP: at most 5 files
- OpenHands: at most 5 files
- Stagehand: at most 5 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 4 files
- total default budget: 24 files
- exceed by 2 only for directly relevant extraction, evidence ranking, webpage observation, report, or safe text summarization files

Focus:

- Playwright MCP: text/snapshot extraction shape, safe observation summaries, link/title evidence boundaries
- OpenHands: webpage/tool observation rendering, concise report output, safety redaction
- Stagehand: observe/extract result structure, extraction quality hints, action/result separation
- Inspect AI: evidence scoring/report patterns and safe transcript summaries
- mini-swe-agent: concise trajectory/report summaries and failure-safe evidence output
- coding-agent baselines: result rendering, source/evidence summaries, bounded output discipline

Answer in docs/design/public-readonly-extraction-quality.md:

1. What should public read-only extraction return beyond HTTP status?
2. How should HTML/text/json/content-type differences be handled safely?
3. What should be ranked, and what should never be ranked?
4. How should extraction quality be surfaced to users and reports?
5. What remains blocked until browser automation exists?
6. What should Route 123 own?

## This route changes

Allowed:

- docs/design/public-readonly-extraction-quality.md
- docs/design/edit-capability-roadmap.md, concise Route 122 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserReadOnlyContentType.ts
- packages/ts-shell/src/core/context/browserReadOnlyContentNormalizer.ts
- packages/ts-shell/src/core/context/browserReadOnlyExtractionModel.ts
- packages/ts-shell/src/core/context/browserReadOnlyExtractionQuality.ts
- packages/ts-shell/src/core/context/browserReadOnlyEvidenceRanking.ts
- packages/ts-shell/src/core/context/browserReadOnlyExtractionSurface.ts
- packages/ts-shell/src/core/harness/browserReadOnlyExtractionScenarioExamples.test.ts

Allowed if clean:

- integrate extraction model into browserPublicReadOnlyWebEvidence
- integrate ranked extraction into receipt/surface output
- improve /browser execute public read-only output
- improve smoke report output
- improve sidebar/report summaries
- add deterministic injected-client extraction scenarios

## Boundaries

Preserve:

- no default public-network tests
- no browser launch
- no JavaScript execution
- no crawling
- no automatic link following
- no cookies/auth/session headers
- no credential URLs
- no POST/PUT/PATCH/DELETE
- no form submission
- no auth/payment/destructive/upload/download/screenshot/OCR
- no Playwright dependency
- no MCP launch
- no dynamic skill discovery
- no provider/model calls
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no default persistent state
- no global allowlist changes
- no automatic allowlist update
- no automatic confirmation
- no automatic replay
- no raw full page content, cookies, headers, URL credentials, secrets, or hidden reasoning in reports, receipts, cache, or output

Extraction quality is post-processing of already allowed read-only evidence. It is not authority to fetch more pages.

## Tasks

### 1. Design

Create docs/design/public-readonly-extraction-quality.md.

Keep it concise.

Include:

- reference scan summary
- Route 120/121 baseline
- content-type extraction policy
- HTML/text/json handling
- extraction block model
- quality/ranking model
- UX/report model
- no-crawling/no-browser boundary
- Route 123 recommendation

### 2. Add content type model

Add browserReadOnlyContentType.ts.

Supported content classes:

- html
- plain-text
- json-summary
- unsupported
- binary-blocked
- over-budget

Required behavior:

- classify from content-type header safely
- never trust extension alone
- block binary/blob-like content
- summarize JSON only within budget
- reject unsafe/unknown content if needed

Add focused tests.

### 3. Add content normalizer

Add browserReadOnlyContentNormalizer.ts.

Normalizer should:

- accept bounded response body from existing runner only
- strip script/style/noscript if HTML
- remove comments and unsafe markup
- decode basic entities if safe
- normalize whitespace
- preserve bounded text only
- redact secrets and credential-like material
- never persist raw body
- output warnings/redactions

Add focused tests.

### 4. Add extraction model

Add browserReadOnlyExtractionModel.ts.

Extraction fields:

- title
- canonical URL summary
- meta description summary
- headings
- main text candidates
- safe snippets
- link summaries with budget
- content warnings
- extraction redactions
- extraction completeness

Rules:

- no crawling
- no link fetching
- no raw full page body
- bounded snippets only
- no credentials/secrets

Add focused tests.

### 5. Add extraction quality model

Add browserReadOnlyExtractionQuality.ts.

Quality dimensions:

- title present
- meaningful headings
- enough safe text
- content type supported
- budget truncation
- redaction count
- blocked binary/unsupported content
- redirect-safe final origin
- extraction confidence

Statuses:

- high
- medium
- low
- blocked
- unsupported

Add focused tests.

### 6. Add evidence ranking

Add browserReadOnlyEvidenceRanking.ts.

Ranking should order:

- title/meta first
- headings
- strongest main-text snippets
- relevant links if safe
- warnings/redactions last

Ranking must not:

- infer facts beyond extracted text
- fetch linked pages
- expose raw body
- hide safety warnings

Add focused tests.

### 7. Add extraction surface

Add browserReadOnlyExtractionSurface.ts.

Render:

- Page title
- Origin
- Content type
- Extraction quality
- Key headings/snippets
- Safe links summary
- Redactions/warnings
- What was not done: browser, JS, crawl, auth, writes
- Next action

Keep concise.

Add focused tests.

### 8. Integrate into public read-only evidence/receipt/surface

Update existing public read-only evidence/receipt/surface if clean.

Required behavior:

- successful GET output includes extraction quality and top ranked snippets
- HEAD output explains no body extraction was attempted
- unsupported content type is blocked or summarized safely
- response over budget is reported as truncated, not raw
- existing Route 120/121 tests remain stable

Add focused tests.

### 9. Smoke and report polish

Update smoke report / UX summary if clean.

Required behavior:

- smoke report can include extraction quality when body exists
- skipped/unavailable/blocked outputs remain concise
- no raw body

Add focused tests if touched.

### 10. Scenario coverage

Add browserReadOnlyExtractionScenarioExamples.test.ts.

Required scenarios:

1. HTML title/headings/snippets extracted and ranked
2. script/style/comment content stripped
3. safe links summarized without fetching
4. plain text summarized safely
5. JSON summarized within budget
6. binary/unsupported content blocked or safe unsupported status
7. over-budget body truncated safely
8. secret-looking content redacted
9. HEAD response has no extraction body
10. redirect-safe final origin reflected in extraction summary
11. public read-only command output includes extraction quality
12. local controlled-network path unchanged

### 11. Sidebar/report integration

If clean:

- report includes extraction quality and top snippet summary
- sidebar summary includes public read-only extraction status
- no raw page content or credentials

Add focused tests if touched.

### 12. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 122 added public read-only extraction quality/ranking
- no crawling/browser/JS/write expansion
- next route recommendation

Recommended next route:

- Route 123: public read-only source citation and quote budget discipline
- or Route 123: public read-only extraction CLI UX polish
- or Route 123: browser automation design only after read-only extraction remains stable

## Validation

Run:

- focused tests for touched browser/context modules
- focused tests for touched command modules if touched
- focused tests for touched harness modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.
Do not add package scripts.
Do not run public network smoke tests unless explicit env is set.

## Stop conditions

Stop and report if:

- extraction requires browser launch
- extraction requires JavaScript execution
- extraction requires crawling or automatic link following
- cookies/auth/session become necessary
- POST/write action becomes necessary
- Playwright dependency becomes necessary
- MCP launch becomes necessary
- provider/model calls become necessary
- raw page content or credentials would appear
- package/schema changes become necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Extraction quality/ranking design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.
