import { getInstalledPlugins, runPluginCommand } from "../../../core/commands/pluginCommandRuntime.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { readState } from '../../../extensions/store/state.js';
import { rootIdentity } from '../../../extensions/lifecycle/grants.js';

/**
 * Plugin chooser.
 *
 * Multi-select over the installed set: the checkbox state *is* the enabled
 * state, so applying is one diff against what was already on disk rather than a
 * sequence of enable/disable commands the user has to type.
 */
export function pluginPicker(context: CommandContext): Picker {
  return {
    title: "Enabled plugins",
    form: "panel",
    empty: "No plugins installed. Use /marketplace to find some.",
    multiple: true,
    async load(): Promise<readonly Option[]> {
      if (context.extensionCommand) return readState().packages.map(plugin => ({ id: plugin.name, label: plugin.name, detail: plugin.active.manifest.description ?? '', note: plugin.active.manifest.version,
        selected: plugin.activation[rootIdentity(context.cwd)]?.enabled === true }));
      return getInstalledPlugins().map<Option>((plugin) => ({
        id: plugin.name,
        label: plugin.name,
        detail: plugin.description ?? "",
        note: plugin.version,
        selected: plugin.enabled,
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const wanted = new Set(ids);
      const notes: string[] = [];
      if (context.extensionCommand) {
        for (const plugin of readState().packages) {
          const enabled = plugin.activation[rootIdentity(context.cwd)]?.enabled === true; const shouldEnable = wanted.has(plugin.name);
          if (enabled !== shouldEnable) notes.push((await context.extensionCommand('plugin', [shouldEnable ? 'enable' : 'disable', plugin.name], context)).output);
        }
        return { note: notes.join('\n') || 'No extension changes.' };
      }
      for (const plugin of getInstalledPlugins()) {
        const shouldEnable = wanted.has(plugin.name);
        if (shouldEnable === plugin.enabled) continue;
        const result = await runPluginCommand([shouldEnable ? "enable" : "disable", plugin.name], context);
        if (result.kind === "local") notes.push(result.output);
      }
      return { note: notes.length > 0 ? notes.join("\n") : "No plugin changes." };
    },
  };
}
