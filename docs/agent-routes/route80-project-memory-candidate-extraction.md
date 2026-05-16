# Route 80: Project memory candidate extraction

## Goal

Start the memory-system phase without implementing memory storage.

Route 74 created the context engineering baseline.
Route 75 added Compact v2 packet / handoff.
Route 76 added `/compact` command surface.
Route 77 added live checkpoint + future-turn adapter.
Route 78 wired actual future-turn injection.
Route 79 hardened repeated compact / merge / quality / budget behavior.

Route 80 should extract project memory candidates from the existing compact/context/session evidence pipeline.

This route should add:

- memory candidate taxonomy
- memory candidate extractor
- project memory candidate projection from Compact v2 packets
- memory candidate quality / safety checks
- memory candidate rendering for user/session visibility
- tests proving useful project facts are extracted and unsafe facts are rejected

This route must not add persistent memory storage, automatic memory writes, cross-session memory loading, startup cache, sidebar UI, provider/MCP changes, or SessionManager schema changes.

The output of this route should be candidate facts only.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-route-continuity.md
- docs/design/compact-v2-session-integration.md
- docs/design/compact-live-checkpoint-future-turn-adapter.md
- docs/design/compact-v2-future-turn-injection.md
- docs/design/compact-v2-quality-merge-hardening.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- Compact v2 injection is working.
- Repeated `/compact` merge/quality/budget is hardened.
- Context projection already labels memory candidates.
- No real memory system exists yet.
- No persistence exists yet.
- No startup cache/sidebar UI exists yet.

## Reference scan

Do a bounded scan before code edits.

Reference repos:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- 12 files total by default
- may exceed by 2 only for directly relevant memory/context/project-state files

Search focus:

- memory
- project memory
- context memory
- session summary
- compact memory
- preferences
- project facts
- resume
- checkpoint
- context injection

Answer in docs/design/project-memory-candidate-extraction.md:

1. What kinds of facts do references retain beyond a single turn?
2. How do they distinguish project facts, user preferences, session facts, and transient tool output?
3. What facts are unsafe to remember?
4. What should this project treat as project memory candidates?
5. What should remain compact/session-only until a real memory store exists?

## This route changes

Allowed:

- docs/design/project-memory-candidate-extraction.md
- docs/design/context-engineering-continuity-baseline.md, Route 80 note only
- docs/design/compact-v2-quality-merge-hardening.md, Route 80 note only
- docs/design/edit-capability-roadmap.md, concise Route 80 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/projectMemoryCandidate.ts
- packages/ts-shell/src/core/context/projectMemoryCandidateExtractor.ts
- packages/ts-shell/src/core/context/projectMemoryCandidateQuality.ts
- packages/ts-shell/src/core/context/projectMemoryCandidateSurface.ts

Allowed if clean:

- integrate candidate extraction into Compact v2 command output as a non-persistent preview section
- expose candidate summary in compact/session surface
- add JSON candidate output for tests/dev if existing conventions support it

## This route must preserve

Route-specific boundaries:

- no persistent memory store
- no automatic memory write
- no cross-session memory loading
- no startup cache
- no sidebar UI
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in memory candidates
- no user-profile memory beyond explicit candidate classification

## Tasks

### 1. Design and audit

Create docs/design/project-memory-candidate-extraction.md.

Include:

- reference scan summary
- current Compact v2 / context baseline
- memory candidate taxonomy
- extraction sources
- safety and redaction policy
- project memory versus session memory versus user preference
- candidate quality model
- non-persistence guarantee
- future memory-store boundary
- next-route decision criteria

### 2. Add memory candidate model

Add packages/ts-shell/src/core/context/projectMemoryCandidate.ts.

Expected concepts:

- candidateId
- candidateKind:
  - project-fact
  - project-structure
  - capability-state
  - route-decision
  - user-preference-candidate
  - validation-pattern
  - restore/recovery-boundary
  - blocked-by-design-decision
  - transient-session-fact
  - rejected
- retentionClass:
  - project-scoped-candidate
  - session-scoped-only
  - user-memory-candidate
  - never-remember
- confidence:
  - high
  - medium
  - low
- source:
  - compact-packet
  - context-projection
  - route-handoff
  - validation-evidence
  - user-stated-preference
  - system-derived
- safety:
  - safe
  - needs-review
  - unsafe
- reason
- evidence
- redactions

The model must be pure and non-persistent.

Add focused tests if helpers exist.

### 3. Add memory candidate extractor

Add packages/ts-shell/src/core/context/projectMemoryCandidateExtractor.ts.

The extractor should consume:

- CompactContinuityPacket
- contextStateProjection output
- route handoff facts
- validation evidence
- edit closeout facts
- optional explicit user preference facts

It should extract candidates such as:

- project uses RTK command discipline
- current edit capability closeout state
- blocked-by-design edit decisions
- current compact/continuity route state
- validation patterns that repeatedly matter
- route discipline preferences
- user preference candidates when explicitly stated
- future next-phase decisions when stable

It must reject or mark never-remember:

- raw file content
- raw recovery content
- secrets
- provider credentials
- hidden reasoning
- transient command output
- temporary paths
- failed speculative assumptions
- one-off route residue
- ambiguous inferred user preferences

Add focused tests.

### 4. Add memory candidate quality checks

Add packages/ts-shell/src/core/context/projectMemoryCandidateQuality.ts.

Quality checks should verify:

- candidate has source/evidence
- candidate is not raw content
- candidate is not secret-sensitive
- candidate is not hidden reasoning
- candidate is not transient unless classified session-only
- user-preference candidates are explicit, not inferred from one ambiguous action
- blocked-by-design decisions include reason
- capability-state facts include source route/doc evidence
- unsafe candidates are rejected or marked never-remember

Output:

- qualityStatus: "pass" | "warn" | "reject"
- warnings
- blockers
- evidence

Add focused tests.

### 5. Add memory candidate surface renderer

Add packages/ts-shell/src/core/context/projectMemoryCandidateSurface.ts.

It should render a compact user/session summary:

- memory candidates found
- project-scoped candidates
- session-only facts
- user-preference candidates needing review
- rejected/unsafe candidates
- redactions
- no persistence performed

User-facing wording must be clear:

- “candidate” means not stored yet
- no memory has been written
- future route will decide persistence/review UX

Add focused tests.

### 6. Integrate candidate extraction with Compact v2

Update compact command runner / session surface only if clean.

Preferred behavior:

- `/compact` output can include a short “Memory candidates” section
- section is concise and optional if no candidates
- JSON/dev packet can include candidate list if existing conventions support it
- no persistence
- no automatic memory write
- no cross-session loading

If integration is coupled:

- keep extractor + surface tested
- document integration blocker

### 7. Add extraction tests

Required tests:

- extracts project capability-state candidate from edit closeout facts
- extracts blocked-by-design decision candidate
- extracts route-decision candidate from compact packet
- extracts validation-pattern candidate from validation evidence
- extracts explicit user preference candidate only when explicit
- does not infer user preference from ambiguous behavior
- rejects raw file content
- rejects raw recovery content
- rejects secrets/provider credentials
- marks transient command output as session-only or rejected
- surface clearly says no memory was written

### 8. Docs and roadmap update

Update:

- docs/design/project-memory-candidate-extraction.md with final notes
- docs/design/context-engineering-continuity-baseline.md with Route 80 note
- docs/design/compact-v2-quality-merge-hardening.md with Route 80 note
- docs/design/edit-capability-roadmap.md with concise status and Route 81 recommendation

Recommended next route:

- Route 81: Memory candidate review / approval UX
  - before any persistent memory store
- or Route 81: Project memory store prototype
  - only if candidate extraction is stable and review boundary is clear

## Validation

Route-specific final validation:

- focused tests for touched core/context modules
- focused tests for touched compact/session modules if integrated
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad `src/core/shell` or `src/session` paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- memory candidate extraction requires persistent storage
- review/approval UX becomes necessary for this route
- candidate extraction requires provider/model calls
- raw content or secrets would need to become candidates
- SessionManager schema changes become necessary
- sidebar UI becomes necessary
- startup cache becomes necessary
- user preference memory would be inferred without explicit user signal

## Final report

1. What changed
2. Reference scan summary
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.
