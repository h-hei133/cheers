import { guideRows } from "../../../core/commands/help/report.js";
import { listSlashCommands, subscribeSlashCommands, type SlashCatalogScope } from "../../../entrypoints/slashCommandRegistry.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";

/** A guide choice is a draft, never an executable callback. */
export function helpPicker(scope?: SlashCatalogScope, admission?: () => string | undefined): Picker {
  const isCurrent = () => { try { return !admission?.(); } catch { return false; } };
  return {
    title: "Slash commands",
    form: "panel",
    empty: "No matching commands",
    footer: "Enter to insert · Esc to close",
    holdInput: true,
    isCurrent,
    load: async () => isCurrent() ? helpOptions(scope) : [],
    subscribe: publish => isCurrent() ? subscribeSlashCommands(() => {
      if (isCurrent()) publish(helpOptions(scope));
    }, scope, isCurrent) : () => {},
    apply: async ids => {
      // Resolve against the current registry so a removed extension cannot be
      // inserted by a stale selection. Named invocations retain their semantics.
      if (!isCurrent() || ids.length !== 1) return undefined;
      const command = helpOptions(scope).find(option => option.id === ids[0]);
      return command && !command.disabled ? { draft: `${command.id} ` } : undefined;
    },
  };
}

function helpOptions(scope?: SlashCatalogScope): Option[] {
  return guideRows(listSlashCommands(scope), scope?.root ?? process.cwd());
}
