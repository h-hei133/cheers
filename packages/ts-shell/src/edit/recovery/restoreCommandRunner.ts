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
    mode: command.mode,
    ledgerRoot: command.ledgerRoot,
    authorityId: command.authorityId,
    workspaceRoot: command.workspaceRoot,
    recordSelection: command.recordSelection,
  });

  return {
    mode: command.mode,
    executed: bridgeResult.executed,
    restorableFiles:
      command.mode === "preview" ? bridgeResult.skippedFiles : [],
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
