import type { CommandContext } from '../../../core/commands/types.js';
import { readToolPool } from '../../../core/commands/toolsCommandRuntime.js';
import { toolLabel, toolReport, toolSummary } from '../../../core/commands/tools/report.js';
import { span } from '../../../core/commands/report/projection.js';
import { toolPlanMode } from '../../../core/query/toolPolicy.js';
import type { Picker } from '../overlay.js';

const UNAVAILABLE = 'Tool catalog unavailable. Reopen /tools to retry.';
const TOOL_INSPECTION_TIMEOUT_MS = 30_000;

/** Selection opens documentation; it cannot call a tool or grant permission. */
export function toolsPicker(context: CommandContext): Picker {
  const isCurrent = (): boolean => {
    try { return !context.signal?.aborted && context.admission?.() === undefined; } catch { return false; }
  };
  return {
    isCurrent,
    title: 'Tools', form: 'panel', holdInput: true,
    status: () => isCurrent() ? undefined : 'Session or configuration changed. Reopen /tools.',
    footer: 'Enter to inspect · Esc to close',
    empty: 'No matching tools', loadError: UNAVAILABLE,
    async load(signal) {
      const pool = await readToolPool(context, signal);
      signal?.throwIfAborted();
      return [...pool.values()].sort((a, b) => a.name.localeCompare(b.name)).map(tool => ({
        id: tool.name, label: span(toolLabel(tool.name, context.cwd)).text,
        detail: span(toolSummary(tool.description, context.cwd)).text,
        note: `Plan: ${toolPlanMode(tool.name, tool)}`,
      }));
    },
    async apply(ids) {
      if (!ids[0] || !isCurrent()) return undefined;
      try {
        // Re-resolve exact identity: a removed mixed-case tool must not open a
        // different lower-case tool or documentation from an obsolete pool.
        const tool = (await readToolPool(context, AbortSignal.timeout(TOOL_INSPECTION_TIMEOUT_MS))).get(ids[0]);
        return tool ? { report: toolReport(tool, context.cwd) }
          : { note: 'This tool is no longer available. Reopen /tools to refresh.' };
      } catch { return isCurrent() ? { note: UNAVAILABLE } : undefined; }
    },
  };
}
