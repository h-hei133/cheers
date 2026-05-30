# Context Planning Route CP001: Context And Planning Quality Audit

## Goal

Start the next capability block after the Agent Loop block.

PL002 to PL009 established the Agent Loop product adapter, phase map, and future feature integration contract.

CP001 must audit and plan the Context and Planning Quality Block.

This route is audit and planning only.

Do not implement product code in this route.

## Why this block is next

The Agent Loop now provides the main spine:

prompt
-> model boundary
-> tool batch
-> save point
-> next turn
-> verification and repair handoff
-> session context
-> product surface
-> result truthfulness

The next bottleneck is whether the agent can understand a repository well enough to choose the right context and produce useful plans.

Current risks:

- context discovery may be shallow
- planning may be scattered across multiple owners
- target selection may be fragile
- vague tasks may not become grounded plans
- memory reuse may be projection-only
- context completeness may be overclaimed
- planning may bypass the Agent Loop adapter
- future edit/provider/verification routes may receive weak or wrong context

CP001 must define how Context and Planning should become a strong capability block while staying connected to the Agent Loop.

## Required inputs

Use local project state.

Use recent docs if present:

- docs/build-infrastructure/product-loop-agent-loop-block-closeout.md
- docs/build-infrastructure/product-loop-agent-loop-phase-roadmap.md
- docs/build-infrastructure/product-loop-real-cli-agent-loop-audit.md
- docs/build-infrastructure/product-loop-real-cli-agent-loop-implementation-plan.md
- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md
- docs/build-infrastructure/build-infrastructure-owner-domain-map.md
- docs/build-infrastructure/build-infrastructure-deferred-patterns.md

Use current source code.

Use local reference repositories only for targeted comparison if needed.

Do not rely on memory alone.

## Required inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- planning runtime
- planning runtime product execution
- planning runtime product projection
- planning runtime product proposal
- planning mutation proposal bridge
- workflow task plan
- target ranking
- context engine
- context memory
- repo intelligence
- read delivery projection
- read window continuation
- session context rebuild projection
- context rebuild input from PL008
- product loop adapter from PL009
- feature integration contract from PL009
- runtime workflowExecutionCoordinator
- ShellSessionRuntime host seam
- result and evidence truthfulness
- product surface rendering
- tests around planning, context, repo intelligence, target ranking, context memory, product execution, result contract

Inspect local reference repositories only for targeted comparison:

- repository discovery
- code graph or symbol map
- context ranking
- planning owner
- task decomposition
- memory reuse
- target selection
- verification intent generation from plan
- plan-to-edit handoff

Do not broad dump any repository.

Record inspected symbols and files in the final report.

## Audit questions

### 1. Current context path map

Map current flow from user task to context facts:

- prompt or task classification
- repo scan or candidate discovery
- file or symbol ranking
- staged reads
- context graph
- context memory
- context rebuild
- missing facts
- not-proven claims
- product surface output

For each step identify:

- owner domain
- current source file
- product integrated or test/demo only
- connected to Agent Loop adapter or separate path
- truthfulness risks

### 2. Current planning path map

Map current flow from context facts to plan:

- task analysis
- plan generation
- target selection
- edit target readiness
- verification intent
- proposal handoff
- next action
- unsupported or blocked decisions

For each step identify:

- owner domain
- current source file
- product integrated or projection only
- connected to Agent Loop adapter or separate path
- not-proven claims

### 3. Weakness classification

Classify known weaknesses:

- broad repo discovery
- code graph quality
- symbol understanding
- cross-file reasoning
- target ranking
- missing facts handling
- stale context detection
- memory reuse
- continuation context
- plan ownership
- plan-to-edit handoff
- plan-to-verification handoff
- product surface clarity
- false confidence in context completeness

Use labels:

- product-proven
- partial
- projection-only
- contract-only
- not-proven
- blocked
- stale
- unsafe to claim

### 4. Agent Loop connection

For every context/planning capability, specify how it connects to the Agent Loop product adapter.

Required fields:

- loop phase
- input facts
- output handoff facts
- runtime events
- evidence facts
- product surface section
- not-proven claims
- forbidden success shortcut
- validation gate

No future context/planning work may bypass the Agent Loop adapter.

### 5. Next implementation block

Choose the immediate implementation route after CP001.

Candidate implementation blocks:

1. repo intelligence and context discovery upgrade
2. staged read and context graph hardening
3. planning owner consolidation
4. target selection and edit target readiness
5. memory reuse and stale context invalidation
6. plan-to-verification intent handoff
7. context and planning product surface clarity
8. integrated context planning adapter for Agent Loop

The audit should decide what can be combined aggressively.

Likely grouping:

- repo intelligence + context discovery + target ranking
- staged read + context graph + missing facts
- planning owner + plan-to-edit + plan-to-verification handoff
- memory reuse + stale invalidation + continuation context

Do not combine if it causes owner confusion or broad rewrite.

### 6. Truthfulness risks

Document guardrails:

- context found is not enough-context success
- file ranked high is not correct target
- plan generated is not edit authority
- edit target ready is not apply authority
- memory reused is not fresh context
- stale context hidden is false success
- optional missing facts must stay visible
- verification intent is not verification passed
- product surface rendered is not task success

### 7. Validation plan

Define validation for the next implementation route.

Required validation should include:

- focused context discovery tests
- target ranking tests
- missing facts tests
- stale context tests
- memory reuse tests
- planning owner tests
- plan-to-edit handoff tests
- plan-to-verification handoff tests
- Agent Loop feature contract tests
- product surface tests
- result-contract if terminal/session output is touched
- build
- diff and status hygiene

## Required output documents

Create these docs under docs/build-infrastructure:

1. context-planning-quality-audit.md

Must include:

- current context path map
- current planning path map
- weakness classification
- Agent Loop connection map
- truthfulness risks
- validation strategy

2. context-planning-quality-roadmap.md

Must include:

- recommended CP002 onward route sequence
- what each route implements
- what each route defers
- what can be combined
- what must stay separate
- owner domains
- validation expectations
- completion criteria
- when the block can be considered close to target

Update if present:

- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Only update it if this audit sharpens the immediate route.

Do not create JSON reports.

Do not create route runners.

Do not create verify scripts.

## Architecture constraints

Hard rules:

- audit and planning only
- no product code changes
- no route-numbered product files
- no external-origin product naming in product paths
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
- no product loop bypass
- no provider default enablement
- no real provider calls
- no tool behavior changes
- no command allowlist expansion
- no edit behavior changes
- no verification behavior changes
- no repair behavior changes
- no session schema migration
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement CP002
- rewrite planning runtime
- rewrite context engine
- rewrite workflowExecutionCoordinator
- call provider
- execute tools
- edit tests to make future implementation easier
- add package scripts
- create route runner
- create verify script
- create JSON capability report
- change product behavior

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required for docs-only audit.

If product code is accidentally touched, revert it or run focused validation and explain why.

After validation is green, commit the docs with message:

cp001: audit context planning quality block

Do not push.

Do not commit failing states.

Do not claim build or tests passed unless actually run.

## Completion criteria

CP001 is COMPLETE only if:

- targeted inspection was performed and reported
- current context path is mapped
- current planning path is mapped
- weaknesses are classified
- Agent Loop connection requirements are specified
- next implementation route is selected
- truthfulness risks and guardrails are documented
- validation plan is documented
- required docs are created
- no product code is changed
- git diff check passes
- commit is created after green validation
- git status is reported

If the current context or planning paths are too unclear to plan safely, report PARTIAL and list exactly what must be inspected next.

## Final report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. Current context path summary
5. Current planning path summary
6. Weakness classification
7. Agent Loop connection requirements
8. Recommended route sequence
9. Immediate next implementation route
10. Truthfulness guardrails
11. Validation pass or fail
12. Commit hash if committed
13. Files changed
14. Confirmation whether product code changed

## Next route

After CP001 is complete, continue with the immediate route selected by the audit.

The expected likely next route is:

docs/build-infrastructure/route/route-cp002-repo-intelligence-context-discovery-upgrade.md

But CP001 may rename or regroup it if the audit finds a better sequence.
