# Route 114: browser self-healing explicit manifest patch writer

## Goal

Add an explicit local/test manifest patch writer for metadata-safe browser self-healing repairs.

Route 112 added self-healing proposals.
Route 113 added explicit apply, but only cache repair and command-context confirmation could actually apply.
Runner binding, skill metadata, allowlist, and fixture refresh proposals remained blocked-safe because no safe manifest writer existed.

Route 114 should add that writer.

Target behavior:

- apply runner-binding, skill-metadata, allowlist, and fixture-refresh patches only to explicit local/test manifests
- use atomic write and validation before write
- preserve no global mutation
- preserve no browser execution
- preserve no automatic replay
- preserve no external network
- produce apply report, sidebar/report summary, and harness evidence

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-self-healing-manifest-patch-writer.md
- docs/design/edit-capability-roadmap.md: concise Route 114 note only

Do not append Route 114 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-self-healing-explicit-apply.md
- docs/design/browser-action-self-healing-proposal.md
- docs/design/browser-replay-repair-readiness.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- self-healing proposals exist
- proposal-only patches exist
- explicit apply command exists
- cache repair can apply through existing cache repair path
- confirmation can apply only to explicit command context
- runner binding, skill metadata, allowlist, and fixture refresh are still blocked-safe
- no manifest patch writer exists

## Reference scan

Primary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Stagehand: at most 8 files
- Playwright MCP: at most 5 files
- OpenHands: at most 4 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 4 files
- total default budget: 26 files
- exceed by 2 only for directly relevant manifest patch, repair apply, tool metadata, or report files

Focus:

- Stagehand: action repair metadata, cached action update boundaries, safe apply limits
- Playwright MCP: browser tool metadata, capability schema, action evidence constraints
- OpenHands: explicit recovery action reporting and user-visible repair surfaces
- Inspect AI and mini-swe-agent: reproducible repair reports and safe trajectory metadata

Answer in docs/design/browser-self-healing-manifest-patch-writer.md:

1. Which self-healing patches are safe to write into explicit local/test manifests?
2. What validation must run before writing?
3. What atomic write discipline should be used?
4. What must remain blocked or preview-only?
5. How should apply output prove no browser execution or replay happened?
6. What should Route 115 own?

## This route changes

Allowed:

- docs/design/browser-self-healing-manifest-patch-writer.md
- docs/design/edit-capability-roadmap.md, concise Route 114 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserSelfHealingManifestPatch.ts
- packages/ts-shell/src/core/context/browserSelfHealingManifestPatchPolicy.ts
- packages/ts-shell/src/core/context/browserSelfHealingManifestPatchWriter.ts
- packages/ts-shell/src/core/context/browserSelfHealingManifestPatchSurface.ts
- packages/ts-shell/src/core/harness/browserSelfHealingManifestPatchScenarioExamples.test.ts

Allowed if clean:

- extend browserSelfHealingApplyExecutor to use manifest patch writer
- extend repair apply command output with manifest patch result
- add sidebar/report summaries for manifest patch apply
- patch only explicit local/test manifest files passed by harness or command context
- use temp-file plus rename atomic write
- validate manifest before and after patch

## Boundaries

Preserve:

- no automatic repair
- no automatic replay
- no browser execution changes
- no external network
- no dynamic skill discovery
- no MCP launch
- no Playwright dependency
- no provider/model calls
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no default persistent state
- no global allowlist changes
- no global runner binding changes
- no raw evidence/secrets in manifests, patch plans, apply reports, command output, or sidebar events

Manifest patching is allowed only for explicit local/test manifests. Applied metadata is not authority to replay automatically.

## Tasks

### 1. Design

Create docs/design/browser-self-healing-manifest-patch-writer.md.

Keep it concise.

Include:

- reference scan summary
- manifest patch taxonomy
- allowed patch targets
- blocked patch targets
- validation-before-write policy
- atomic write policy
- apply output model
- no-auto-replay boundary
- Route 115 recommendation

### 2. Add manifest patch model

Add browserSelfHealingManifestPatch.ts.

Patch kinds:

- add-runner-binding
- add-skill-metadata
- update-allowlist-local-fixture
- refresh-fixture-summary
- add-confirmation-local-context-reference
- no-op-blocked

Patch fields:

- patch id
- proposal id
- target manifest kind
- target manifest path summary
- intended changes
- validation requirements
- blockers
- warnings
- applied: false by default
- browser executed: false
- replay executed: false

Add focused tests.

### 3. Add patch policy

Add browserSelfHealingManifestPatchPolicy.ts.

Policy should allow:

- add-runner-binding only for explicit local/test manifest
- add-skill-metadata only for explicit local/test manifest
- local-fixture allowlist update only for local-fixture scheme or local test origin
- fixture refresh only for sanitized fixture summary

Policy should block:

- external network allowlist
- auth/payment/destructive/upload/download/screenshot/OCR
- arbitrary JavaScript
- dynamic discovery
- global config mutation
- raw evidence insertion
- secret-looking values

Statuses:

- patch-allowed
- patch-needs-explicit-manifest
- patch-blocked-unsafe
- patch-blocked-external-network
- patch-blocked-global-scope
- patch-blocked-unsupported
- patch-not-applicable

Add focused tests.

### 4. Add patch writer

Add browserSelfHealingManifestPatchWriter.ts.

Writer should:

- require explicit manifest path/context
- load and validate manifest
- apply allowed patch to a sanitized in-memory copy
- validate patched manifest
- write with temp file plus rename
- return sanitized result
- never write raw evidence
- never mutate global config
- never execute replay or browser action

Supported manifest targets should include only current safe browser manifests if clean:

- browser external runner manifest
- browser skill runner manifest
- browser local fixture manifest
- browser receipt cache manifest only if patch is cache-related and safe

If a manifest format is too coupled, return blocked with next action instead of forcing unsafe writes.

Add focused tests with temp dirs.

### 5. Add patch surface

Add browserSelfHealingManifestPatchSurface.ts.

Render:

- Browser self-healing manifest patch
- Proposal id
- Patch kind
- Target
- Validation
- Applied: yes/no
- Browser executed: no
- Replay executed: no
- Warnings/blockers
- Next action

Add focused tests.

### 6. Integrate with apply executor

Update browserSelfHealingApplyExecutor if clean.

Required behavior:

- proposal apply can create manifest patch plan
- apply uses writer only when explicit manifest context exists
- missing context returns apply-needs-explicit-context
- unsafe patch blocks
- output clearly says no browser/replay execution happened
- existing cache repair and confirmation apply behavior remains stable

Add focused tests.

### 7. Integrate command output

Update browserSelfHealingCommandRunner or command surface if clean.

Required behavior:

- /browser repair apply <proposal-id> --confirm can apply safe manifest patches when explicit context exists
- without explicit context, it produces plan and blocked-safe next action
- invalid proposal id stays blocked
- no noisy output

Add focused tests.

### 8. Report/sidebar integration

If clean:

- scenario report includes manifest patch summary
- sidebar event includes patch kind/status
- no raw manifest content

Add focused tests if touched.

### 9. Scenario coverage

Add browserSelfHealingManifestPatchScenarioExamples.test.ts.

Required scenarios:

1. add-runner-binding writes explicit local/test manifest
2. add-skill-metadata writes explicit local/test manifest
3. update local-fixture allowlist writes explicit local/test manifest
4. refresh fixture summary writes sanitized fixture metadata only
5. external network allowlist patch is blocked
6. unsafe evidence patch is blocked
7. missing manifest context returns blocked-safe plan
8. after apply, replay still requires explicit /browser replay command
9. command output says browser executed: no and replay executed: no

### 10. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 114 added explicit local/test manifest patch writer for metadata-safe self-healing repairs
- no automatic repair/replay
- no browser execution changes
- next route recommendation

Recommended next route:

- Route 115: self-healing apply cross-process CLI harness
- or Route 115: replay UX/report polish
- or Route 115: external-network browser execution design only after manifest patching remains stable

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

## Stop conditions

Stop and report if:

- patch writer requires global config mutation
- patch writer requires browser execution
- patch writer requires automatic replay
- patch writer requires external network
- patch writer requires dynamic skill discovery
- MCP launch becomes necessary
- provider/model calls become necessary
- raw evidence/secrets would appear
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Manifest patch policy/design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.
