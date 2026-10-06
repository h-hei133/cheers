import { ConfigWriteError } from '../../../config/outcome.js';
import { restoreSessionModel, type SessionModelReceipt } from '../../../session/model/state.js';
import { SessionModelWriteError } from '../../../session/model/outcome.js';

/** Do not publish when two durable owners have an unresolved outcome. */
export function globalModelFailure(error: unknown, receipt?: SessionModelReceipt): string {
  if (error instanceof ConfigWriteError && error.state === 'unchanged') {
    if (!receipt) return error.message;
    try {
      const restored = restoreSessionModel(receipt);
      return `${error.message} Session preference ${restored === 'restored' ? 'restored and verified' : 'unchanged'}. Current runtime configuration was not refreshed.`;
    } catch (restoreError) {
      const detail = restoreError instanceof SessionModelWriteError ? restoreError.message : 'restoration outcome is unverified.';
      return `${error.message} Session compensation failed: ${detail} Inspect saved preferences and reload.`;
    }
  }
  const globalOutcome = error instanceof ConfigWriteError ? error.message : 'Global write outcome is unverified.';
  return `${receipt ? 'Session preference saved and verified. ' : ''}${globalOutcome} Current runtime configuration was not refreshed. Inspect saved preferences and reload.`;
}
