import { getSessionUsage, totalTokens } from '../../../observability/usageTelemetry.js';
import { costModel } from '../../../core/commands/cost/model.js';
import { costReport } from '../../../core/commands/cost/report.js';
import { loadCatalog } from '../../../core/models/catalogStore.js';
import { runUsageCommand } from '../../../core/commands/usageCommandRuntime.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Picker } from '../overlay.js';

/**
 * Session accounting and explicit account inspection.
 *
 * Opening the panel reads the local ledger only. Account quota is never fetched
 * on open: the user must select that row, and the original usage command keeps
 * its approval, cancellation and binding checks.
 */
export function usagePicker(context: CommandContext): Picker {
  let selected = false;
  let sessionId: string | undefined;
  let configurationRevision: number | undefined;
  const isCurrent = (): boolean => {
    try {
      if (context.signal?.aborted) return false;
      if (context.admission?.() !== undefined) return false;
      if (context.signal?.aborted) return false;
      if (context.sessionId !== sessionId) return false;
      const revision = context.readConfiguration?.().revision;
      return !context.signal?.aborted && (revision === undefined || configurationRevision === undefined || revision === configurationRevision);
    } catch {
      return false;
    }
  };
  return {
    isCurrent,
    title: 'Usage',
    form: 'panel',
    empty: 'No usage data is available for this session.',
    footer: 'Enter opens the measured report. Account quota is fetched only by its explicit row.',
    async load(signal) {
      signal?.throwIfAborted();
      context.signal?.throwIfAborted();
      const refused = context.admission?.();
      context.signal?.throwIfAborted();
      if (refused !== undefined) return [];
      sessionId = context.sessionId;
      const publication = context.readConfiguration?.();
      configurationRevision = publication?.revision;
      signal?.throwIfAborted();
      context.signal?.throwIfAborted();
      const usage = getSessionUsage(sessionId ?? '');
      const catalog = publication?.catalog ?? loadCatalog();
      const model = costModel(usage, catalog);
      return [
        {
          id: 'overview',
          label: 'Measured session usage',
          detail: `${model.recordedTurns} turns · ${totalTokens(usage)} tokens recorded`,
          note: `${model.modelCount} model${model.modelCount === 1 ? '' : 's'} · estimate ${model.estimate.coverage}`,
        },
        {
          id: 'account',
          label: 'Account quota',
          detail: 'Fetch the selected account quota and reset offers',
          note: context.usageCommand ? 'requires explicit fetch' : 'unavailable in this host',
          disabled: !context.usageCommand,
        },
        {
          id: 'reset-status',
          label: 'Reset receipts',
          detail: 'Inspect local reset requests without contacting the account service',
          note: context.usageCommand ? 'local only' : 'unavailable in this host',
          disabled: !context.usageCommand,
        },
      ];
    },
    async apply(ids) {
      if (ids.length !== 1 || !ids[0] || !isCurrent() || selected) return undefined;
      const action = ids[0];
      if (action === 'overview') {
        const usage = getSessionUsage(context.sessionId ?? '');
        const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
        if (context.signal?.aborted) return undefined;
        return { report: costReport(costModel(usage, catalog), context.cwd) };
      }
      if (action !== 'account' && action !== 'reset-status') return undefined;
      selected = true;
      try {
        const result = await runUsageCommand(action === 'account' ? ['account'] : ['reset', 'status'], context);
        return isCurrent() ? { note: result.output } : undefined;
      } catch (error) {
        return isCurrent() ? { note: error instanceof Error ? error.message : 'Account usage is unavailable.' } : undefined;
      } finally {
        selected = false;
      }
    },
  };
}
