# NormProof Report

Run ID: generated-structure-judge
Verdict: proven
Summary: All blocking obligations are satisfied by compiled norm obligations.

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
Source verdict: proven
Would block: no
Did block: no
Reason: Proof verdict is proven; enforcement does not block.
Open blocking obligations: 0
Repair plan available: no

## Open Obligations Summary
Capacity status: **healthy**
Total open blocking: 0
Estimated token budget: **low** (Suitable for low-context analysis.)

### Open Blocking Obligations
- none

### Top Proof Gaps
- none

### Next Evidence Needed
- none

### Repair Item Summaries
- none

## Proof Ledger
Ledger status: satisfied
Open obligations: 0
Failed obligations: 0
Proof gaps: 0
Evidence bindings: 3
Derivation: All blocking obligations are satisfied and no blocking proof gaps remain.


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
- none


## Verdict Derivation
Input verdict: proven
Derived verdict: proven
Ledger status: satisfied
Blocking problems: 0
Blocking proof gaps: 0
Summary: All blocking obligations are satisfied and no blocking proof gaps remain.


## Artifact Contract
- ledger.json: pass (https://normproof.local/schemas/ledger-v0.8.schema.json@0.8)


## Norm Profile
Profile: software-structure-v0@0

## Obligation Source Summary
- norm-profile: 3




## Obligations
- source_graph_is_acyclic: satisfied (Obligation source_graph_is_acyclic holds.)
- source_graph_has_no_unresolved_specifiers: satisfied (Obligation source_graph_has_no_unresolved_specifiers holds.)
- declared_functions_within_module_ceiling: satisfied (Obligation declared_functions_within_module_ceiling holds.)

## Evidence
- task: A1 task (task.md)
- source_module_graph: A0 source_module_graph (src/**/*.ts)
- source_module_functions: A0 source_module_functions (src/**/*.ts)

## Missing Or Failed Obligations
- none

## Suggested Next Action
Record verdict.json and report.md with the host completion evidence.
