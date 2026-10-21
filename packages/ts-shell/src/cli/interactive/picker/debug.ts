import type { CommandContext } from '../../../core/commands/types.js';
import { debugSyntax } from '../../../core/commands/debug/syntax.js';
import { runDebugCommand } from '../../../core/commands/debugCommandRuntime.js';
import type { Picker } from '../overlay.js';

/** The menu is static; diagnostic storage is read only after explicit selection. */
export function debugPicker(context: CommandContext): Picker {
  const offered = new Set<string>();
  const isCurrent = (): boolean => {
    try { return context.admission?.() === undefined; } catch { return false; }
  };
  return {
    isCurrent,
    title: 'Debug diagnostics', form: 'panel',
    empty: 'No matching diagnostic views',
    footer: 'Enter to inspect · Esc to close',
    status: () => isCurrent() ? undefined : 'Session or configuration changed. Reopen /debug.',
    async load(signal) {
      signal?.throwIfAborted();
      if (!isCurrent()) return [];
      const options = debugSyntax.actions.map(action => ({ id: action.name, label: action.name, detail: action.summary }));
      offered.clear();
      for (const option of options) offered.add(option.id);
      return options;
    },
    previewEnd: () => offered.clear(),
    async apply(ids) {
      if (ids.length !== 1 || !offered.has(ids[0]!) || !isCurrent()) return undefined;
      offered.clear();
      try {
        const result = await runDebugCommand([ids[0]!], context);
        if (!isCurrent()) return undefined;
        return result.report ? { report: result.report } : { note: result.output };
      } catch { return isCurrent() ? { note: 'Diagnostic source unavailable. Reopen /debug to retry.' } : undefined; }
    },
  };
}
