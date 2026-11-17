# NormProof Report

Run ID: generated-structure-judge
Verdict: not_proven
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
Source verdict: not_proven
Would block: yes
Did block: no
Reason: Shadow mode records that the proof verdict would block in blocking mode but does not block.
Open blocking obligations: 1
Repair plan available: no

## Open Obligations Summary
Capacity status: **healthy**
Total open blocking: 1
Estimated token budget: **high** (Requires full context analysis.)

### Open Blocking Obligations
- **source_graph_has_no_unresolved_specifiers** (missing): Every module import resolves within the declared source graph (Gaps: unreadable_file; Needed: source_module_graph)

### Top Proof Gaps
- source_graph_is_acyclic: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_has_no_unresolved_specifiers: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_is_acyclic: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_has_no_unresolved_specifiers: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- declared_functions_within_module_ceiling: contradictory_evidence (21 declared names against a ceiling of 20)

### Next Evidence Needed
- source_module_graph

### Repair Item Summaries
- none

## Proof Ledger
Ledger status: not_proven
Open obligations: 2
Failed obligations: 1
Proof gaps: 5
Evidence bindings: 3
Derivation: 1 blocking obligation(s) are open or failed; 2 blocking proof gap(s) remain.


## Evidence Registry Summary
Present evidence: 1
Missing evidence: 4
Authorities: A0=1


## Evidence Binding Summary
Bindings: 3
- source_graph_is_acyclic requires source_module_graph: missing (missing, required A0) via source_module_graph
- source_graph_has_no_unresolved_specifiers requires source_module_graph: missing (missing, required A0) via source_module_graph
- declared_functions_within_module_ceiling requires source_module_functions: bound (A0, required A0) via source_module_functions


## Proof Gaps
- source_graph_is_acyclic: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_has_no_unresolved_specifiers: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_is_acyclic: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_has_no_unresolved_specifiers: unreadable_file (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- declared_functions_within_module_ceiling: contradictory_evidence (21 declared names against a ceiling of 20)


## Verdict Derivation
Input verdict: not_proven
Derived verdict: not_proven
Ledger status: not_proven
Blocking problems: 1
Blocking proof gaps: 2
Summary: 1 blocking obligation(s) are open or failed; 2 blocking proof gap(s) remain.


## Artifact Contract
- ledger.json: pass (https://normproof.local/schemas/ledger-v0.8.schema.json@0.8)


## Norm Profile
Profile: software-structure-v0@0

## Obligation Source Summary
- norm-profile: 3




## Obligations
- source_graph_is_acyclic: missing (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- source_graph_has_no_unresolved_specifiers: missing (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)
- declared_functions_within_module_ceiling: failed (Obligation declared_functions_within_module_ceiling does not hold: 1 module(s) exceed the 20-name ceiling: packages/ts-shell/src/cli/interactive/interactiveMode.test.ts)

## Evidence
- task: A1 task (task.md)
- source_module_functions: A0 source_module_functions (packages/**/*.ts*)

## Missing Or Failed Obligations
- source_graph_has_no_unresolved_specifiers: missing (Failed to read evidence file source_module_graph: oversized: module graph exceeds the 16384 edge ceiling; collection is incomplete)

## Suggested Next Action
Capture the missing deterministic evidence, then rerun check-run.
