# SP054 Capability Audit And Three Sprint Push Plan

## Goal

Audit the current autonomous development ability against a stronger local agent project and produce an aggressive three-sprint plan to push capability toward top-tier behavior.

This goal is an audit and planning goal, but it must be grounded in current code. It is not a vague summary task.

The output must be stored in:

- docs/sprint/autonomous-capability-audit.md
- docs/sprint/three-sprint-capability-push-plan.md

Do not cover extension ecosystem, SDK, TUI, marketplace, theme, or plugin productization. Focus only on autonomous development ability.

## Required Tools

Use Serena MCP for symbol navigation, references, owner discovery, diagnostics, and targeted code inspection.

Use the Spec-Driven Develop plugin for decomposition and requirement coverage.

Use Superpowers where available:

- using-superpowers
- systematic-debugging
- subagent-driven-development
- dispatching-parallel-agents
- verification-before-completion
- writing-plans
- requesting-code-review or receiving-code-review for the final audit if available

Use local navigation first:

/home/wang/projects/pi-docs-playbook

Read README.md, AGENTS.md, and usage/task-reading-matrix.md, then only files matched to the inspected capability.

Use mature local source after target owner inspection:

/home/wang/projects/pi

Inspect concrete areas only:

- agent loop
- execution harness
- tool result handling
- action dispatch
- context and session state
- compaction or long task carry-forward
- verification
- repair
- artifact handling
- result reduction

## Four Level Introduction Rule

For every capability proposed for later adoption, classify the recommended level:

1. dependency use
2. structured port
3. isolated source adoption
4. behavior-only alignment

Explain why earlier levels are or are not appropriate.

Do not copy names, paths, runtime fields, user-visible wording, or architecture wholesale.

## Audit Scope

Audit current project code and sprint records.

Required current-project evidence:

- core query runtime and loop
- AgentRunner or closest concrete execution seam
- tools policy and typed feedback
- planning action graph and execution planning
- context selection
- verification execution and verification command coverage
- repair loop and repair strategy
- session replay and continuation durability
- artifact workflow and claim evidence
- evidence task proof
- result task verdict
- runtime evaluation task
- live task execution acceptance path
- SP044 through SP053 sprint records and diagnostics

Required questions:

1. What autonomous development abilities are truly implemented in product code?
2. Which abilities are only proven by diagnostics or fixed catalog tasks?
3. Which abilities are still mostly proof, receipt, or acceptance hardening?
4. Where does normal runtime still not match a mature agent execution loop?
5. Where does AgentRunner or the concrete execution seam still lack control depth?
6. Where does tool feedback remain less mature than the stronger local project?
7. Where is long task state, replay, compaction, or continuation still weak?
8. Where is repair still too shallow compared with real debugging loops?
9. Where is verification still target selection rather than meaningful execution?
10. Which architecture debts would block the next capability push?

## Required Comparison

Compare against the stronger local project only in autonomous development capability areas.

Do not claim parity unless code evidence proves it.

Use this classification:

- ahead
- roughly comparable
- partially comparable
- behind
- not proven

Every classification must include:

- current project evidence
- stronger local project evidence
- gap
- severity
- next action

## Required Output 1: Capability Audit

docs/sprint/autonomous-capability-audit.md must include:

- executive verdict
- current ability map
- comparison table
- strongest areas
- weakest areas
- top 10 capability gaps
- top 5 architecture debts
- claims that are still not proven
- evidence list with file and owner references
- short conclusion on whether the project is close to top-tier behavior

The verdict must be honest. Do not flatter the project.

## Required Output 2: Three Sprint Push Plan

docs/sprint/three-sprint-capability-push-plan.md must include exactly three next sprints.

Each sprint must include:

- title
- main capability target
- why it is one of the top three priorities
- product owners to change
- stronger local project areas to inspect
- four-level introduction decision
- implementation expectations
- non-substitutable completion gates
- anti-shortcut rules
- validation commands
- live provider blocked behavior
- expected visible capability gain

The three sprints must be aggressive and packed. They must not be closeout or acceptance-only work.

At least one sprint must force real unseen development tasks. At least one sprint must force execution seam or tool feedback deepening if the audit finds it behind. At least one sprint must force long task session or repair depth if the audit finds it behind.

## Non-Substitution Rules

Do not let future sprints be satisfied by:

- proof-only work
- receipt-only work
- event or surface work
- catalog-only work
- liveRun-only work
- evaluation-only work
- docs-only work
- test-only work
- owner count without product behavior
- mission count without real capability gain

Every proposed sprint must include a requirement coverage table.

## Live Provider Rule

This audit does not require live provider execution.

If live provider is used and fails only because of provider-network, provider-config, provider-auth, or provider-unreachable, set goal status to blocked.

Blocked is not complete.

When blocked, report:

- exact retest command
- expected pass fields
- observed provider failure class
- why this is not a product runtime failure
- current git status
- whether changes are uncommitted

Do not use temporary stop language. Do not repeatedly retry live after provider-classified failure.

## Naming And Content Rules

During development, product file names and product content must not contain process wording, comparison wording, reading-process wording, or names of outside codebases. Use domain language only.

Docs created by this goal may mention inspected local paths and capability classifications.

## Completion Gates

This goal is not complete until:

1. both required documents exist
2. current project code was inspected with Serena
3. stronger local project docs and source were inspected
4. at least 10 capability areas are classified
5. top 10 gaps are ranked
6. top 5 architecture debts are ranked
7. exactly three aggressive next sprints are defined
8. each proposed sprint has non-substitutable completion gates
9. each proposed sprint says what cannot count as completion
10. final report includes which tools were used and what evidence was inspected
11. docs are registered in DOC_STATUS
12. diff check passes

If commit is made after gates pass, one push attempt is allowed. If push fails, do not retry.
