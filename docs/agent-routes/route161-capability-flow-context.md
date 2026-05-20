# Route 161: Capability Flow - implementation context pack

## Module

- Primary module: Capability Contract Architecture
- Secondary modules: Agent Loop, CLI / UX, Session / Continue, Result Surface, Tool, Runtime, Workspace / File Context, Edit / Patch, Browser, Provider / Model, Permission / Policy, Harness / Eval
- Route type: implementation-context route
- Product behavior boundary: documentation / manifest / optional validator only, unless Codex finds a trivial behavior-preserving doc reference update
- Validation tier: Tier 1 by default; escalate only if source code or package scripts are changed

## Goal

Build an AI-usable implementation context pack that explains how capabilities flow through the modularized system.

Routes 154-160 completed the first central-file owner-module extraction pass. The next problem is not a single large file; it is that future implementation work needs a reliable wiring map:

- where a capability enters
- which owner module owns each lifecycle stage
- which facade should be used
- what each stage consumes and emits
- which downstream module consumes the output
- where result truthfulness, transcript persistence, continuation, verification, and reports are handled
- which shortcuts are forbidden

The output should be useful to Codex when implementing future routes. It does not need to be optimized as a human architecture essay.

## Output location

Create a new directory:

- `docs/implementation-context/`

Do not put the new context pack under `docs/architecture/`.

Expected files may include:

- `docs/implementation-context/README.md`
- `docs/implementation-context/capability-flow-graph.md`
- `docs/implementation-context/capability-flow-manifest.json`
- `docs/implementation-context/capability-recipes.md`
- optional: `docs/implementation-context/module-io-catalog.md`
- optional: `scripts/architecture/validate-capability-flow.mjs`
- optional: `scripts/architecture/validate-capability-flow.test.mjs`

Codex may adjust file names if it finds a cleaner structure, but the output must stay under `docs/implementation-context/` except for optional validation scripts.

## Core requirement

The route must produce an implementation context pack, not just a prose document.

At minimum, cover these three layers:

### 1. Flow graph

Describe how a user/task flows through the system.

Minimum flows to cover:

- CLI prompt / non-interactive turn
- read / inspect
- edit / patch
- tool / command runtime
- browser transaction
- provider diagnostic / model path
- session / continue
- verifier / harness

For each flow, record:

- entry point
- owner module
- lifecycle stages used
- public facades involved
- key inputs
- key outputs
- downstream consumers
- result surface handoff
- transcript / continuation handoff
- validation gates
- forbidden shortcuts

### 2. Machine-readable manifest

Create `capability-flow-manifest.json`.

It should be structured enough for future AI routes to consume.

Suggested top-level shape:

- `modules`
- `flows`
- `contracts`
- `recipes`
- `validation`

Codex may refine the schema, but the manifest should answer:

- which module owns this capability
- which facade is the public entry
- which upstream facts are required
- which output object or summary is produced
- which downstream module consumes it
- which fields must not be emitted
- which tests or verifiers protect the flow

Avoid making the manifest huge. It should be practical and maintainable.

### 3. Implementation recipes

Create `capability-recipes.md`.

Include recipes for future Codex routes, such as:

- adding a bounded edit capability
- adding a browser action
- adding a provider diagnostic marker
- adding a CLI command
- adding a verifier gate
- adding a result stopped path
- adding continuation support for a capability

Each recipe should tell Codex:

- start in which owner module
- use which facade
- consume which contract
- emit which handoff object or summary
- do not bypass which modules
- run which focused validation gates

Keep recipes operational, not philosophical.

## Inputs to read

Required project docs:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`
- central-file extraction docs from Routes 154-160:
  - `runmvp-module-extraction.md`
  - `session-runtime-module-extraction.md`
  - `sessionmanager-module-extraction.md`
  - `cli-module-extraction.md`
  - `verifier-module-extraction.md`
  - `resultmapper-module-extraction.md`
- contract docs:
  - `tool-policy-result-contract.md`
  - `runtime-receipt-contract.md`
  - `workspace-file-context-contract.md`
  - `session-substrate-seams.md`
  - `future-edit-expansion-contract.md`

Relevant code should be sampled as needed, especially public facades created in Routes 145-160.

Reference repositories are optional. Use them only if current project docs are not enough to define a flow or recipe. Do not perform a broad reference scan by default.

Useful references if needed:

- opencode for tool/session/permission flow
- gemini-cli for CLI/core handoff
- OpenHands for action/observation/event flow
- Inspect AI for eval/report flow
- ClaudeCode for query/tool/session handoff

## Suggested manifest guidance

The manifest should be concise and practical.

Example style, not required exact schema:

- `modules.agentLoop.publicFacades`
- `modules.resultSurface.publicFacades`
- `flows.editPatch.stages`
- `flows.browserTransaction.stages`
- `flows.verifierGate.stages`
- `contracts.result.requiredStoppedFields`
- `contracts.evidence.forbiddenFields`
- `recipes.addEditCapability.requiredFacades`
- `validation.routeTiers`

Recommended common contracts to capture:

- `CapabilityPlan`
- `PolicyDecision`
- `WorkspaceTarget`
- `RuntimeReceipt`
- `CapabilityEvidence`
- `ResultHandoff`
- `TerminalSummary`
- `TranscriptEvent`
- `ContinuationSeed`
- `VerifierReport`

Do not invent heavy new TypeScript types unless the current code already has equivalent concepts. This route is about documenting the wiring context.

## Optional validator

If useful, add a small no-dependency validator:

- `scripts/architecture/validate-capability-flow.mjs`

It should validate the manifest shape, not product behavior.

Suggested checks:

- every flow has an owner module
- every flow has at least one public facade
- every flow declares downstream consumers
- every flow declares validation gates
- every flow declares forbidden shortcuts or forbidden fields
- every module referenced by a flow exists in the manifest
- common redaction fields are present

If adding the validator takes too long or makes the route too script-heavy, document why it was skipped and keep the manifest manually reviewable.

## What not to do

Do not:

- create an import-police route
- rewrite product source
- change module behavior
- change result truthfulness
- change CLI/session/provider/browser/edit/runtime behavior
- change package scripts
- add dependencies
- run package sweep by default
- make the docs so verbose that future Codex routes cannot quickly consume them
- make the schema so strict that it blocks reasonable future work

## Update existing docs

Update only lightweight pointers in existing docs:

- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/module-backlog.md`
- optionally `docs/agent-routes/module-route-template.md`

The update should say that future module routes should consult `docs/implementation-context/` before wiring new capability paths.

Do not move old architecture docs.

## Validation

Required:

- JSON parse check for `capability-flow-manifest.json`
- `rtk git diff --check`
- `rtk git status --short --branch`
- package file diff guard:
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

If a validator is added:

- `rtk node --check scripts/architecture/validate-capability-flow.mjs`
- validator self-test if added
- validator run against the manifest

Build is not required unless TypeScript source changes.

Package sweep is not required unless product source or package scripts change.

## Completion report

Final report should include:

1. Branch and base commit
2. Files changed
3. What implementation context files were created
4. Which flows are covered
5. Manifest shape summary
6. Recipes included
7. Whether validator was added
8. Existing docs updated
9. Validation commands and results
10. Source/package change confirmation
11. Remaining gaps
12. Best next action
13. Proposed commit message

Do not commit or push.
