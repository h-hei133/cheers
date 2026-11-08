# NormProof Report

Run ID: generated-structure-judge
Verdict: partial
Summary: 0 blocking obligation(s) are open or failed; 0 blocking proof gap(s) remain.

## Task Manifest
Task ID: generated-structure-judge
Mode: read_only
Goal: Judge this workspace against its declared structural norms.
Workspace: .
Allows mutation: no
Verification required: no
Verification commands: none declared
Allowed paths: none declared
Forbidden paths: none declared


## Enforcement
Mode: shadow
Source verdict: partial
Would block: no
Did block: no
Reason: Every blocking obligation is satisfied; open advisory obligations do not block.
Open blocking obligations: 0
Repair plan available: no

## Open Obligations Summary
Capacity status: **healthy**
Total open blocking: 0
Estimated token budget: **medium** (Suitable for medium-context analysis.)

### Open Blocking Obligations
- none

### Top Proof Gaps
- declared_functions_within_module_ceiling: contradictory_evidence (21 declared names against a ceiling of 20)
- declared_functions_within_module_ceiling: contradictory_evidence (22 declared names against a ceiling of 20)

### Next Evidence Needed
- none

### Repair Item Summaries
- none

## Proof Ledger
Ledger status: open
Open obligations: 0
Failed obligations: 1
Proof gaps: 2
Evidence bindings: 3
Derivation: 0 blocking obligation(s) are open or failed; 0 blocking proof gap(s) remain.


## Evidence Registry Summary
Present evidence: 2
Missing evidence: 3
Authorities: A0=2


## Evidence Binding Summary
Bindings: 3
- source_graph_is_acyclic requires source_module_graph: bound (A0, required A0) via source_module_graph
- source_graph_has_no_unresolved_specifiers requires source_module_graph: bound (A0, required A0) via source_module_graph
- declared_functions_within_module_ceiling requires source_module_functions: bound (A0, required A0) via source_module_functions


## Proof Gaps
- declared_functions_within_module_ceiling: contradictory_evidence (21 declared names against a ceiling of 20)
- declared_functions_within_module_ceiling: contradictory_evidence (22 declared names against a ceiling of 20)


## Verdict Derivation
Input verdict: partial
Derived verdict: partial
Ledger status: open
Blocking problems: 0
Blocking proof gaps: 0
Summary: 0 blocking obligation(s) are open or failed; 0 blocking proof gap(s) remain.


## Artifact Contract
- ledger.json: pass (https://normproof.local/schemas/ledger-v0.8.schema.json@0.8)


## Norm Profile
Profile: software-structure-v0@0

## Obligation Source Summary
- norm-profile: 3




## Obligations
- source_graph_is_acyclic: satisfied (Obligation source_graph_is_acyclic holds.)
- source_graph_has_no_unresolved_specifiers: satisfied (Obligation source_graph_has_no_unresolved_specifiers holds.)
- declared_functions_within_module_ceiling: failed (Obligation declared_functions_within_module_ceiling does not hold: 2 module(s) exceed the 20-name ceiling: packages/ts-shell/src/cli/interactive/interactiveMode.test.ts, packages/ts-shell/src/cli/interactive/interactiveMode.ts)

## Evidence
- task: A1 task (task.md)
- source_module_graph: A0 source_module_graph (packages/**/*.ts*)
- source_module_functions: A0 source_module_functions (packages/**/*.ts*)

## Missing Or Failed Obligations
- none

## Suggested Next Action
Capture the missing deterministic evidence, then rerun check-run.
