import {
  type RestoreCommandRequest,
  type RestoreCommandResult,
  validateRestoreCommandRequest,
} from "./restoreCommandContract.js";
import { runExplicitRestoreBridge } from "./restoreExecutionBridge.js";

export async function runRestoreCommand(
  request: RestoreCommandRequest,
): Promise<RestoreCommandResult> {
  const validation = validateRestoreCommandRequest(request);
  if (validation.ok === false) {
    return validation.result;
  }

  const command = validation.command;
  const bridgeResult = await runExplicitRestoreBridge({
    mode: command.dryRun ? 'preview' : command.mode,
    ledgerRoot: command.ledgerRoot,
    authorityId: command.authorityId,
    workspaceRoot: command.workspaceRoot,
    recordSelection: command.recordSelection,
    assertFileAccess: request.assertFileAccess,
  });

  return {
    mode: bridgeResult.mode,
    outcome: bridgeResult.outcome,
    unknownFiles: bridgeResult.unknownFiles,
    executed: bridgeResult.executed,
    restorableFiles:
      bridgeResult.mode === "preview" ? bridgeResult.skippedFiles : [],
    restoredFiles: [...bridgeResult.restoredFiles],
    blockedFiles: [...bridgeResult.blockedFiles],
    inspectedFiles: [...bridgeResult.inspectedFiles],
    missingRecords: [...bridgeResult.missingRecords],
    automaticRecovery: false,
    rollbackAtomicityClaim: false,
    evidence: [
      ...command.evidence,
      ...bridgeResult.evidence,
      "restore-command-runner:provider-not-invoked",
      "restore-command-runner:no-session-persistence",
      "restore-command-runner:no-automatic-recovery",
      "restore-command-runner:no-rollback",
    ],
  };
}
