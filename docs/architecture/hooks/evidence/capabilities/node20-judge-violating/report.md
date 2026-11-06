# NormProof Report

Run ID: generated-structure-judge
Verdict: failed
Summary: 1 blocking obligation(s) are open or failed; 1 blocking proof gap(s) remain.

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
Source verdict: failed
Would block: yes
Did block: no
Reason: Shadow mode records that the proof verdict would block in blocking mode but does not block.
Open blocking obligations: 1
Repair plan available: no

## Open Obligations Summary
Capacity status: **healthy**
Total open blocking: 1
Estimated token budget: **low** (Suitable for low-context analysis.)

### Open Blocking Obligations
- **source_graph_has_no_unresolved_specifiers** (failed): Every module import resolves within the declared source graph (Gaps: contradictory_evidence; Needed: )

### Top Proof Gaps
- source_graph_has_no_unresolved_specifiers: contradictory_evidence (Record unresolved: src/module.ts -> ./missing.js does not satisfy source_graph_has_no_unresolved_specifiers.)

### Next Evidence Needed
- none

### Repair Item Summaries
- none

## Proof Ledger
Ledger status: failed
Open obligations: 0
Failed obligations: 1
Proof gaps: 1
Evidence bindings: 3
Derivation: 1 blocking obligation(s) are open or failed; 1 blocking proof gap(s) remain.


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
- source_graph_has_no_unresolved_specifiers: contradictory_evidence (Record unresolved: src/module.ts -> ./missing.js does not satisfy source_graph_has_no_unresolved_specifiers.)


## Verdict Derivation
Input verdict: failed
Derived verdict: failed
Ledger status: failed
Blocking problems: 1
Blocking proof gaps: 1
Summary: 1 blocking obligation(s) are open or failed; 1 blocking proof gap(s) remain.


## Artifact Contract
- ledger.json: pass (https://normproof.local/schemas/ledger-v0.8.schema.json@0.8)


## Norm Profile
Profile: software-structure-v0@0

## Obligation Source Summary
- norm-profile: 3




## Obligations
- source_graph_is_acyclic: satisfied (Obligation source_graph_is_acyclic holds.)
- source_graph_has_no_unresolved_specifiers: failed (Obligation source_graph_has_no_unresolved_specifiers does not hold: 1 member(s) of source_module_graph match unresolved: */** but must not: unresolved: src/module.ts -> ./missing.js)
- declared_functions_within_module_ceiling: satisfied (Obligation declared_functions_within_module_ceiling holds.)

## Evidence
- task: A1 task (task.md)
- source_module_graph: A0 source_module_graph (src/**/*.ts)
- source_module_functions: A0 source_module_functions (src/**/*.ts)

## Missing Or Failed Obligations
- source_graph_has_no_unresolved_specifiers: failed (Obligation source_graph_has_no_unresolved_specifiers does not hold: 1 member(s) of source_module_graph match unresolved: */** but must not: unresolved: src/module.ts -> ./missing.js)

## Suggested Next Action
Fix the failed obligations, recapture deterministic evidence, and rerun check-run.
