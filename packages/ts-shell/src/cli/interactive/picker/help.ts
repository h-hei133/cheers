import { COMMAND_GROUPS, guideRows } from "../../../core/commands/help/report.js";
import { listSlashCommands, subscribeSlashCommands, type SlashCatalogScope } from "../../../entrypoints/slashCommandRegistry.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";
import { CatalogNavigation } from './navigation.js';

/** A guide choice is a draft, never an executable callback. */
export function helpPicker(scope?: SlashCatalogScope, admission?: () => string | undefined): Picker {
  let navigation = new CatalogNavigation();
  const isCurrent = () => { try { return !admission?.(); } catch { return false; } };
  return {
    title: "Slash commands",
    form: "panel",
    empty: "No matching commands",
    footer: "↑↓ browse · Tab: categories/commands · ←→: categories/commands · Enter: insert · Esc: back",
    holdInput: true,
    get navigation() { return navigation; },
    onOpen: () => { navigation = new CatalogNavigation(); },
    filterOptions: query => navigation.project(query),
    detail: id => {
      const row = navigation.all.find(option => option.id === id);
      return row ? [row.label, ...(row.detail ?? '').split(/;\s+/), row.note ?? ''].filter(Boolean) : [];
    },
    isCurrent,
    load: async () => isCurrent() ? helpOptions(scope, navigation) : [],
    subscribe: publish => isCurrent() ? subscribeSlashCommands(() => {
      if (isCurrent()) publish(helpOptions(scope, navigation));
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

function helpOptions(scope?: SlashCatalogScope, navigation?: CatalogNavigation): Option[] {
  const rows = guideRows(listSlashCommands(scope), scope?.root ?? process.cwd());
  navigation?.set(rows, new Map(rows.map(row => [row.id, { category: row.group }])),
    [{ id: 'all', label: 'All commands' }, ...Object.entries(COMMAND_GROUPS)
      .filter(([id]) => rows.some(row => row.group === id)).map(([id, label]) => ({ id, label }))]);
  return rows;
}
