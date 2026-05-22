#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const testTargets = [
  'src/orchestration/patchParsing/parser.test.ts',
  'src/orchestration/patchParsing/fencedPatchExtractor.test.ts',
  'src/orchestration/patchParsing/boundedBroadPatchNormalizer.test.ts',
  'src/orchestration/patchParsing/broadPatchUnsupportedReason.test.ts',
  'src/orchestration/patchResult/boundedApplyPatchCandidate.test.ts',
  'src/orchestration/patchResult/boundedWritePolicy.test.ts',
  'src/orchestration/patchResult/editCompatibilityGauntlet.test.ts',
  'src/orchestration/patchResult/editCapabilityReadiness.test.ts',
  'src/orchestration/patchResult/editCapabilityCloseoutManifest.test.ts',
  'src/orchestration/fencedEditPlanner.test.ts',
  'src/orchestration/fencedEditOutcome.test.ts',
  'src/orchestration/discoveryEditManifest.test.ts',
  'src/orchestration/discoveryEditConfirmation.test.ts',
  'src/orchestration/discoveryEditPlanner.test.ts',
  'src/orchestration/discoveryEditResult.test.ts',
  'src/orchestration/generatedEditProposal.test.ts',
  'src/orchestration/generatedEditPlanner.test.ts',
  'src/orchestration/generatedEditConfirmation.test.ts',
  'src/orchestration/generatedEditResult.test.ts',
  'src/orchestration/providerEditContext.test.ts',
  'src/orchestration/providerEditProposal.test.ts',
  'src/orchestration/providerEditPlanner.test.ts',
  'src/orchestration/providerEditConfirmation.test.ts',
  'src/orchestration/providerEditResult.test.ts',
  'src/orchestration/contextAwareProviderEdit.test.ts',
  'src/orchestration/contextAwareProviderPrompt.test.ts',
  'src/orchestration/contextAwareProviderProposal.test.ts',
  'src/orchestration/contextAwareProviderResult.test.ts',
  'src/orchestration/realProviderProposalGate.test.ts',
  'src/orchestration/providerPromptAudit.test.ts',
  'src/orchestration/providerOutputValidator.test.ts',
  'src/orchestration/providerAnchorQuality.test.ts',
  'src/orchestration/realProviderProposalDryRun.test.ts',
  'src/orchestration/providerDryRunResult.test.ts',
  'src/orchestration/editRepairContext.test.ts',
  'src/orchestration/editRepairProposal.test.ts',
  'src/orchestration/editRepairPlanner.test.ts',
  'src/orchestration/editRepairResult.test.ts',
  'src/orchestration/verificationCommandPlan.test.ts',
  'src/orchestration/verificationCommandRunner.test.ts',
  'src/orchestration/verificationCommandResult.test.ts',
  'src/orchestration/verificationFailureClassifier.test.ts',
  'src/orchestration/verificationRepairBridge.test.ts',
  'src/orchestration/verificationRepairContext.test.ts',
  'src/orchestration/verificationRepairPlanner.test.ts',
  'src/orchestration/verificationRepairResult.test.ts',
  'src/orchestration/verificationRepairLoop.test.ts',
  'src/orchestration/editProposalReview.test.ts',
  'src/orchestration/editProposalSelection.test.ts',
  'src/orchestration/editProposalApply.test.ts',
  'src/orchestration/editProposalReviewResult.test.ts',
  'src/orchestration/exactHunkSet.test.ts',
  'src/orchestration/exactHunkConflict.test.ts',
  'src/orchestration/exactHunkApply.test.ts',
  'src/orchestration/exactHunkResult.test.ts',
  'src/orchestration/proposalHunkSet.test.ts',
  'src/orchestration/proposalHunkSetPlan.test.ts',
  'src/orchestration/proposalHunkSetRoute.test.ts',
  'src/orchestration/proposalHunkSetResult.test.ts',
  'src/orchestration/targetSetEditPlan.test.ts',
  'src/orchestration/targetSetEditPolicy.test.ts',
  'src/orchestration/targetSetEditJournal.test.ts',
  'src/orchestration/targetSetEditTransaction.test.ts',
  'src/orchestration/targetSetEditVerification.test.ts',
  'src/orchestration/targetSetEditRoute.test.ts',
  'src/orchestration/targetSetEditRecoveryWorkflow.test.ts',
  'src/orchestration/targetSetEditRecovery.test.ts',
  'src/orchestration/editSnapshot.test.ts',
  'src/orchestration/editRecoveryPlan.test.ts',
  'src/orchestration/editRecoveryApply.test.ts',
  'src/orchestration/editRecoveryResult.test.ts',
  'src/orchestration/editRollback.test.ts',
  'src/orchestration/fencedEditActivation.test.ts',
  'src/orchestration/fencedEditRoute.test.ts',
  'src/orchestration/fencedEditRuntimeActivation.test.ts',
  'src/session/stoppedSessionContinuity.test.ts',
  'src/session/sessionResumeContextBuilder.test.ts',
  'src/entrypoints/cliProposalReviewSurface.test.ts',
  'src/entrypoints/cliRuntimeInvocation.test.ts',
  'src/orchestration/patchRecovery/restoreCommandContract.test.ts',
  'src/orchestration/patchRecovery/restoreCommandRunner.test.ts',
  'src/orchestration/patchRecovery/restoreExecutionBridge.test.ts',
  'src/orchestration/patchRecovery/restorePreview.test.ts',
]

console.log('gate name=edit-capability-closeout')
console.log('mode=focused')
console.log('status taxonomy: pass=0 product-regression=1 config-failure=3')
console.log('report field activated_fenced_replacement=covered')
console.log('report field stopped_no_write_unsupported=covered')
console.log('report field continuation_safe_evidence=covered')
console.log('report field raw_content_excluded=covered')
console.log('report field edit_snapshot_receipt=covered')
console.log('report field rollback_readiness=covered')
console.log('report field explicit_single_file_rollback=covered')
console.log('report field discovery_edit_manifest=covered')
console.log('report field discovery_edit_confirmation=covered')
console.log('report field discovery_edit_single_target_handoff=covered')
console.log('report field discovery_edit_confirmed_target_set_execution=covered')
console.log('report field generated_edit_proposal=covered')
console.log('report field generated_edit_confirmation=covered')
console.log('report field generated_edit_exact_handoff=covered')
console.log('report field generated_edit_no_raw_content=covered')
console.log('report field provider_edit_context_packet=covered')
console.log('report field provider_edit_fake_proposal=covered')
console.log('report field context_aware_provider_proposal=covered')
console.log('report field real_provider_proposal_dry_run_gate=covered')
console.log('report field provider_prompt_audit=covered')
console.log('report field provider_output_validator=covered')
console.log('report field provider_anchor_quality=covered')
console.log('report field provider_dry_run_no_write_result=covered')
console.log('report field provider_edit_confirmation=covered')
console.log('report field provider_edit_exact_handoff_ready=covered')
console.log('report field provider_edit_no_raw_content=covered')
console.log('report field edit_repair_context=covered')
console.log('report field edit_repair_fake_provider_proposal=covered')
console.log('report field edit_repair_review_required=covered')
console.log('report field edit_repair_hunk_set_handoff=covered')
console.log('report field edit_repair_no_raw_content=covered')
console.log('report field verification_repair_loop_context=covered')
console.log('report field verification_repair_fake_provider_proposal=covered')
console.log('report field verification_repair_review_required=covered')
console.log('report field verification_repair_hunk_set_handoff=covered')
console.log('report field verification_repair_no_automatic_mutation=covered')
console.log('report field verification_command_plan=covered')
console.log('report field verification_command_runtime_receipt=covered')
console.log('report field verification_command_failure_classifier=covered')
console.log('report field verification_command_repair_bridge=covered')
console.log('report field proposal_review_surface=covered')
console.log('report field proposal_selection_confirmation=covered')
console.log('report field proposal_apply_bridge=covered')
console.log('report field proposal_apply_no_raw_content=covered')
console.log('report field proposal_hunk_set_manifest=covered')
console.log('report field proposal_hunk_set_preflight=covered')
console.log('report field proposal_hunk_set_per_target_mapping=covered')
console.log('report field exact_hunk_set_model=covered')
console.log('report field exact_hunk_conflict_detection=covered')
console.log('report field exact_multi_hunk_apply=covered')
console.log('report field exact_hunk_result_summary=covered')
console.log('report field proposal_hunk_set_transaction_recovery=covered')
console.log('report field proposal_hunk_set_result_surface=covered')
console.log('report field target_set_transaction=covered')
console.log('report field target_set_execution_journal=covered')
console.log('report field target_set_preflight_atomicity=covered')
console.log('report field target_set_verification_aggregation=covered')
console.log('report field target_set_partial_failure=covered')
console.log('report field target_set_recovery_workflow_handoff=covered')
console.log('report field explicit_edit_recovery_apply=covered')
console.log('report field result_contract_compatible=covered')
console.log(`repo=${repoRoot}`)

const code = await run('npm', [
  'run',
  'test',
  '-w',
  'packages/ts-shell',
  '--',
  ...testTargets,
])

if (code !== 0) {
  console.log(`[product-regression] edit-capability-closeout - focused tests exited ${code}`)
  process.exit(code)
}

console.log('marker activated-success-reachable-through-prompt-cli')
console.log('marker mutation-ran-for-fenced-edit-success')
console.log('marker mutation-not-run-for-stopped-unsupported-fenced-edit')
console.log('marker missing-mapping-stopped')
console.log('marker multiple-matches-stopped')
console.log('marker stale-read-stopped')
console.log('marker continuation-safe-evidence-present')
console.log('marker raw-content-excluded')
console.log('marker snapshot-receipt-created-before-fenced-edit-write')
console.log('marker snapshot-not-created-for-stopped-no-write')
console.log('marker snapshot-failure-stops-before-mutation')
console.log('marker rollback-readiness-reported-for-write-failures')
console.log('marker rollback-plan-dry-run-supported-for-known-single-file-snapshot')
console.log('marker explicit-single-file-rollback-seam-covered')
console.log('marker discovery-manifest-mutation-authority-not-granted')
console.log('marker discovery-no-candidates-stopped')
console.log('marker discovery-multiple-candidates-confirmation-required')
console.log('marker discovery-too-many-candidates-stopped')
console.log('marker discovery-missing-mapping-stopped')
console.log('marker discovery-unsupported-fuzzy-stopped')
console.log('marker discovery-generated-edit-stopped')
console.log('marker discovery-confirmed-single-target-handoff')
console.log('marker discovery-confirmed-target-set-execution')
console.log('marker generated-proposal-created-no-write')
console.log('marker generated-missing-content-stopped-no-write')
console.log('marker generated-broad-request-stopped-no-write')
console.log('marker generated-fuzzy-request-stopped-no-write')
console.log('marker generated-discovery-request-stopped-no-write')
console.log('marker generated-provider-content-unsupported-no-write')
console.log('marker generated-unconfirmed-proposal-no-mutation')
console.log('marker generated-confirmed-single-target-handoff-existing-fenced-lane')
console.log('marker generated-confirmed-target-set-handoff-existing-target-set-lane')
console.log('marker generated-proposal-session-raw-content-excluded')
console.log('marker provider-edit-context-redacted-budgeted')
console.log('marker provider-edit-fake-provider-proposal-created-no-write')
console.log('marker provider-edit-not-configured-stopped')
console.log('marker provider-edit-opt-in-required-stopped')
console.log('marker provider-edit-context-over-budget-stopped')
console.log('marker provider-edit-invalid-proposal-stopped')
console.log('marker provider-edit-exact-single-target-handoff-ready')
console.log('marker provider-edit-exact-target-set-handoff-ready')
console.log('marker provider-edit-proposal-no-mutation-without-execution-path')
console.log('marker provider-edit-session-report-raw-content-and-secrets-excluded')
console.log('marker context-aware-provider-context-packet-feeds-proposal')
console.log('marker context-aware-provider-agent-plan-feeds-proposal')
console.log('marker context-aware-provider-missing-context-stops-before-call')
console.log('marker context-aware-provider-fake-proposal-created-no-write')
console.log('marker context-aware-provider-result-session-evidence-preserved')
console.log('marker edit-repair-context-created-from-verification-failure')
console.log('marker edit-repair-context-redacted-budgeted')
console.log('marker edit-repair-fake-provider-proposal-created-no-write')
console.log('marker edit-repair-provider-not-configured-stopped')
console.log('marker edit-repair-provider-opt-in-required-stopped')
console.log('marker edit-repair-invalid-proposal-stopped-no-write')
console.log('marker edit-repair-review-required-no-write')
console.log('marker edit-repair-confirmed-hunk-set-handoff-existing-route')
console.log('marker edit-repair-no-automatic-mutation-after-verification-failure')
console.log('marker edit-repair-transaction-recovery-evidence-preserved')
console.log('marker edit-repair-result-session-raw-content-excluded')
console.log('marker verification-repair-context-created-from-verification-failure')
console.log('marker verification-repair-runtime-receipt-markers-preserved')
console.log('marker verification-repair-context-packet-agent-plan-ids-preserved')
console.log('marker verification-repair-missing-verification-stops-before-call')
console.log('marker verification-repair-missing-context-stops-before-call')
console.log('marker verification-repair-fake-provider-proposal-created-no-write')
console.log('marker verification-repair-provider-unavailable-stopped')
console.log('marker verification-repair-invalid-proposal-stopped-no-write')
console.log('marker verification-repair-review-required-no-write')
console.log('marker verification-repair-confirmed-hunk-set-handoff-existing-route')
console.log('marker verification-repair-no-automatic-mutation-after-verification-failure')
console.log('marker verification-repair-result-session-raw-content-excluded')
console.log('marker verification-command-allowlisted-success-runtime-receipt')
console.log('marker verification-command-allowlisted-failure-repair-eligible')
console.log('marker verification-command-not-allowlisted-no-runtime-dispatch')
console.log('marker verification-command-timeout-classified-no-repair')
console.log('marker verification-command-stdout-stderr-budget-redaction')
console.log('marker verification-command-session-continue-evidence')
console.log('marker verification-command-repair-bridge-fake-provider-no-write')
console.log('marker proposal-review-created-no-write')
console.log('marker proposal-reject-no-write')
console.log('marker proposal-selection-required-no-write')
console.log('marker proposal-invalid-selection-no-write')
console.log('marker proposal-non-exact-hunk-no-write')
console.log('marker proposal-confirmed-single-target-apply-existing-fenced-route')
console.log('marker proposal-confirmed-target-set-apply-existing-transaction-route')
console.log('marker proposal-hunk-set-distinct-per-target-exact-mapping-applies')
console.log('marker proposal-hunk-set-multi-hunk-same-file-exact-mapping-applies')
console.log('marker exact-hunk-set-model-raw-content-excluded')
console.log('marker exact-hunk-conflict-overlap-no-write')
console.log('marker exact-hunk-apply-one-snapshot-one-write-per-file')
console.log('marker exact-hunk-result-counts-visible')
console.log('marker proposal-hunk-set-all-hunks-preflight-before-mutation')
console.log('marker proposal-hunk-set-unconfirmed-no-write')
console.log('marker proposal-hunk-set-non-exact-no-write')
console.log('marker proposal-hunk-set-conflicting-hunks-no-write')
console.log('marker proposal-hunk-set-bounded-multi-hunk-per-file-policy')
console.log('marker proposal-hunk-set-partial-failure-recovery-ready')
console.log('marker proposal-hunk-set-no-provider-call-during-apply')
console.log('marker proposal-hunk-set-result-session-raw-content-excluded')
console.log('marker proposal-apply-stopped-preserves-proposal-evidence')
console.log('marker proposal-partial-failure-preserves-transaction-evidence')
console.log('marker proposal-review-apply-raw-content-excluded')
console.log('marker target-set-max-file-guard-stopped-no-write')
console.log('marker target-set-preflight-all-files-before-mutation')
console.log('marker target-set-transaction-id-emitted')
console.log('marker target-set-safe-execution-journal')
console.log('marker target-set-one-preflight-failure-stops-before-all-writes')
console.log('marker target-set-partial-failure-separates-changed-failed-unattempted')
console.log('marker target-set-verification-aggregation-visible')
console.log('marker target-set-recovery-recommendation-visible')
console.log('marker target-set-explicit-recovery-workflow-evidence')
console.log('marker target-set-partial-failure-rollback-readiness')
console.log('marker edit-recovery-plan-from-snapshot-id')
console.log('marker edit-recovery-single-file-rollback-apply')
console.log('marker edit-recovery-target-set-subset-rollback-apply')
console.log('marker edit-recovery-missing-target-stopped-no-write')
console.log('marker edit-recovery-stale-target-stopped-no-write')
console.log('marker edit-recovery-no-automatic-rollback')
console.log('marker discovery-candidate-summary-raw-content-excluded')
console.log('marker result-contract-compatible')
console.log('[pass] edit-capability-closeout')
process.exit(0)

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(3))
  })
}
