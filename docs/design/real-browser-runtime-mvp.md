# Real Browser Runtime MVP

Route 123 opens a controlled real-browser-runtime seam beyond the Route 120-122
HTTP-only public read-only runner. It is explicit, local/test scoped, and does
not enable default browser automation.

## Reference Scan Summary

- Playwright MCP favors structured accessibility snapshots for browser actions;
  targets come from snapshot references or locators, and screenshots are not the
  action authority.
- Stagehand separates observe/act/extract, previews candidate actions, and
  treats cached/self-healed actions as a later reliability layer.
- OpenHands reports browser observations as bounded user-visible observation
  content and keeps action output separate from raw runtime state.
- Inspect AI keeps task definitions, scoring, and reports separate, with clear
  skipped/unavailable behavior.
- mini-swe-agent records trajectories and evidence in bounded reports rather
  than treating subprocess output as hidden state.

## MVP Decision

The Route 123 runtime path is an explicit controlled manifest plus an injected
runtime executor. The implemented default test path is a simulated controlled
browser runtime over deterministic fixtures. External or skill-managed runtime
modes are represented in the manifest and availability model, but this route
does not launch Playwright, MCP, Stagehand, a provider, or a model.

There is no default runtime manifest. `/browser runtime status` reports
unavailable until a caller injects an explicit controlled manifest/executor.

## Snapshot Model

DOM snapshots contain only safe summaries: URL/origin summary, title, headings,
budgeted text nodes, form summaries without values, buttons, links, and input
summaries without values. Scripts, styles, comments, raw DOM, secret-looking
tokens, credential fields, and hidden-reasoning labels are stripped or redacted.

Accessibility snapshots contain a bounded role summary, landmarks, interactive
elements, labels, and candidate action targets. Oversized dumps are truncated,
user-entered values are never stored, and sensitive labels are redacted from
user-visible output.

## Action Loop Boundary

Allowed controlled actions are `navigate`, `observe`, `extract`, `click`, and
`type` through an explicit local/test manifest. Click/type are allowed only for
controlled origins and safe non-sensitive targets. Auth, payment, destructive
actions, upload, download, screenshot, OCR, arbitrary JS, public click/type,
cookies/auth/session persistence, dynamic discovery, and automatic replay remain
blocked.

For click/type, the loop first obtains a safe observation, builds an action
target from the accessibility snapshot, enforces policy, then executes at most
one action and returns a post-action observation. It does not plan multiple
steps automatically.

## Selector Repair Seed

Selector repair is preview-only. Missing or low-confidence targets produce a
repair seed from safe accessibility candidates. Sensitive targets and missing
candidate sets remain blocked. The repair seed never executes a repaired
selector.

## Provenance And Receipts

Each observation records runtime id, URL/origin summary, action kind, snapshot
ids, timestamp, safe-summary-only visibility, citation labels, and quote/snippet
budget. Runtime receipts include runtime mode, action, origin scope, snapshot
ids, provenance id, target id, repair readiness, executed yes/no, browser
launched no, public automation no, JS-rendered support, warnings/redactions,
and next action.

Raw DOM, raw page content, secrets, provider credentials, cookies, auth state,
and hidden reasoning are not persisted or exposed.

## Eval Foundation

The browser eval harness defines deterministic local/test tasks, runs them
through the same controlled action-loop executor, scores expectations, and
renders a compact report. It never calls a provider/model and never accesses
public network.

Initial scenarios cover title/headings observation, rendered text extraction,
button identification, controlled click, safe type, unsafe action blocking,
provenance, redaction, selector repair preview, command/sidebar summaries, and
coexistence with the public HTTP read-only path.

## Route 124 Recommendation

Recommended Route 124 options:

- decide and implement an opt-in real external/skill-managed browser adapter
  without package changes or default runtime changes;
- expand the deterministic browser eval benchmark;
- add controlled selector-repair apply semantics after the preview seed remains
  stable;
- design browser session/auth only after controlled runtime safety is stable.
