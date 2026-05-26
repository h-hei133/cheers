# Route227 Final Capability Reality Map

Final status: PARTIAL

This map follows the weakest upstream evidence from Route227A-H. Route-local evidence is secondary and does not upgrade blocked, partial, fake, focused, default-safe, or not-run evidence.

## COMPLETE

### deterministic proposal
- Evidence: docs/implementation-context/route227c-planning-to-patch-orchestrator-report.json
- Route: route227c
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts -> planningMutationProposalBridge
- Limitations: live provider exact-ready source remains not-proven because Route227A is not COMPLETE; full planning matrix remains not-proven because Route227B is not COMPLETE; repair proposal is not yet normalized through the same planning-to-patch bridge; multi-file proposal per-file status is not yet proven through the same product bridge; live-provider exact-ready proposal through Route227C; repair proposal success; multi-file apply success; proposal authority

### exact update
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source

### create file
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source

### small multi-file apply
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source

### repair-to-success
- Evidence: docs/implementation-context/route227f-repair-iteration-product-loop-report.json
- Route: route227f
- Product path: packages/ts-shell/src/orchestration/verificationRepairIterationFlow.ts::runVerificationRepairIterationFlow
- Limitations: live provider repair proposal; arbitrary task repair from unstructured command output; browser/MCP repair; automatic multi-attempt repair loop; real CLI full repair iteration path

### CLI/session UX
- Evidence: docs/implementation-context/route227h-cli-session-product-experience-report.json
- Route: route227h
- Product path: packages/ts-shell/src/core/shell/sessionRuntime.ts::ShellSessionRuntime.executePrompt
- Limitations: live provider exact proposal success; production default apply; external-live MCP/browser execution; provider execution during apply; broad edit engine repair

### MCP/local tools
- Evidence: docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json
- Route: route227g
- Product path: packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.ts::runToolEcosystemCapabilityRoute
- Limitations: external-live read; external-live mcp__stdioEcho__echo_message; external-live mcp__externalSearch__search; external-live browser.observe; external-live browser.type; external-live external.payments.charge; external-live tool execution

### session continuation
- Evidence: docs/implementation-context/route227h-cli-session-product-experience-report.json
- Route: route227h
- Product path: packages/ts-shell/src/core/shell/sessionRuntime.ts::ShellSessionRuntime.executePrompt
- Limitations: live provider exact proposal success; production default apply; external-live MCP/browser execution; provider execution during apply; broad edit engine repair

## PARTIAL

### context/planning
- Evidence: docs/implementation-context/route227b-context-planning-elite-upgrade-report.json
- Route: route227b
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- Limitations: full Route227B task matrix complete; unsupported broad task negative control; durable cross-session memory reuse through real CLI; LSP-grade code graph; provider-assisted context acquisition; mutation or verification success; unsupported broad negative proof and durable cross-session memory reuse remain partial

### live provider exact proposal
- Evidence: docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json
- Route: route227a
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- Limitations: live provider exact proposal applied and verified; production default live provider; production workspace default write; provider call during apply; fuzzy apply as success; multi-file/add/delete/move live apply; repair-to-success after live verification failure; live provider path was reached, but applied-and-verified exact proposal success remains unproven

### planning-to-patch orchestration
- Evidence: docs/implementation-context/route227c-planning-to-patch-orchestrator-report.json
- Route: route227c
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts -> planningMutationProposalBridge
- Limitations: live provider exact-ready source remains not-proven because Route227A is not COMPLETE; full planning matrix remains not-proven because Route227B is not COMPLETE; repair proposal is not yet normalized through the same planning-to-patch bridge; multi-file proposal per-file status is not yet proven through the same product bridge; live-provider exact-ready proposal through Route227C; repair proposal success; multi-file apply success; proposal authority

### delete/move preview
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source; delete and move apply remain preview-first, not applied capability

### broad refactor decomposition
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source; broad refactor is preview/blocked, not unrestricted mutation

### verification command dispatch
- Evidence: docs/implementation-context/route227e-verification-intelligence-upgrade-report.json
- Route: route227e
- Product path: packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts::runTaskRelevantVerificationRoute
- Limitations: product runtime command dispatch blocked by environment; live provider verification; automatic repair-to-success; arbitrary shell command verification; browser/MCP external verification; full repository verification sweep; product runtime command dispatch was blocked by environment

### focused test selection
- Evidence: docs/implementation-context/route227e-verification-intelligence-upgrade-report.json
- Route: route227e
- Product path: packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts::runTaskRelevantVerificationRoute
- Limitations: product runtime command dispatch blocked by environment; live provider verification; automatic repair-to-success; arbitrary shell command verification; browser/MCP external verification; full repository verification sweep; selection logic exists but runtime dispatch did not prove pass

### add/delete/move apply
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source; create-file is complete; delete/move apply remain not proven

### long-session memory
- Evidence: docs/implementation-context/route227b-context-planning-elite-upgrade-report.json
- Route: route227b
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- Limitations: full Route227B task matrix complete; unsupported broad task negative control; durable cross-session memory reuse through real CLI; LSP-grade code graph; provider-assisted context acquisition; mutation or verification success; durable cross-session memory reuse through real CLI remains not proven

## BLOCKED

## NOT-PROVEN

### browser observation
- Evidence: docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json
- Route: route227g
- Product path: packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.ts::runToolEcosystemCapabilityRoute
- Limitations: external-live read; external-live mcp__stdioEcho__echo_message; external-live mcp__externalSearch__search; external-live browser.observe; external-live browser.type; external-live external.payments.charge; external-live tool execution; browser runtime remained disabled; local/browser unavailable is not observation success

### external tool readiness
- Evidence: docs/implementation-context/route227g-tool-ecosystem-and-external-capabilities-report.json
- Route: route227g
- Product path: packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.ts::runToolEcosystemCapabilityRoute
- Limitations: external-live read; external-live mcp__stdioEcho__echo_message; external-live mcp__externalSearch__search; external-live browser.observe; external-live browser.type; external-live external.payments.charge; external-live tool execution; external-live MCP/browser execution remained not proven

### fallback provider
- Evidence: docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json
- Route: route227a
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- Limitations: live provider exact proposal applied and verified; production default live provider; production workspace default write; provider call during apply; fuzzy apply as success; multi-file/add/delete/move live apply; repair-to-success after live verification failure; fallback policy was not promoted to success evidence

### production default write
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source; production default write remains intentionally not enabled

### fuzzy apply
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source; fuzzy apply success remains explicitly not proven

### rollback
- Evidence: docs/implementation-context/route227d-edit-engine-capability-expansion-report.json
- Route: route227d
- Product path: packages/ts-shell/src/orchestration/controlledEditOperationRoute.ts -> mutationRoutingProjection -> existing workspace create/multi/no-write routes
- Limitations: production default write; delete apply through Route227D; move apply through Route227D; broad refactor apply; fuzzy apply success; automatic rollback executed; live provider edit source; automatic rollback executed remains not proven

### live multi-file provider
- Evidence: docs/implementation-context/route227a-live-provider-exact-proposal-contract-report.json
- Route: route227a
- Product path: packages/ts-shell/src/entrypoints/cli.tsx -> packages/ts-shell/src/core/shell/sessionRuntime.ts -> packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts -> packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- Limitations: live provider exact proposal applied and verified; production default live provider; production workspace default write; provider call during apply; fuzzy apply as success; multi-file/add/delete/move live apply; repair-to-success after live verification failure; live multi-file provider apply was not attempted as success evidence
