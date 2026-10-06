import type { CommandContext } from '../../../core/commands/types.js';
import { readToolPool } from '../../../core/commands/toolsCommandRuntime.js';
import { toolReport, toolSummary } from '../../../core/commands/tools/report.js';
import { span } from '../../../core/commands/report/projection.js';
import { toolPlanMode } from '../../../core/query/toolPolicy.js';
import type { Picker } from '../overlay.js';

const UNAVAILABLE = 'Tool catalog unavailable. Reopen /tools to retry.';

/** Selection opens documentation; it cannot call a tool or grant permission. */
export function toolsPicker(context: CommandContext): Picker {
  return {
    title: 'Tools', form: 'panel', holdInput: true,
    footer: 'Enter to inspect · Esc to close',
    empty: 'No matching tools', loadError: UNAVAILABLE,
    async load() {
      const pool = await readToolPool(context);
      return [...pool.values()].sort((a, b) => a.name.localeCompare(b.name)).map(tool => ({
        id: tool.name, label: span(tool.name).text, detail: span(toolSummary(tool.description)).text,
        note: `Plan: ${toolPlanMode(tool.name, tool)}`,
      }));
    },
    async apply(ids) {
      if (!ids[0]) return undefined;
      try {
        // Re-resolve exact identity: a removed mixed-case tool must not open a
        // different lower-case tool or documentation from an obsolete pool.
        const tool = (await readToolPool(context)).get(ids[0]);
        return tool ? { report: toolReport(tool) }
          : { note: 'This tool is no longer available. Reopen /tools to refresh.' };
      } catch { return { note: UNAVAILABLE }; }
    },
  };
}
