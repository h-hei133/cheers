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
interface PluginChange { readonly name: string; readonly enable: boolean }

/**
 * One change at a time.
 *
 * Enabling or disabling a plugin is a state change the user should see named,
 * not a silent diff produced by a multi-select. Each confirmation applies only
 * its own change; skipping keeps the plugin as it is, and cancelling drops the
 * rest of the batch.
 */
function confirmChange(context: CommandContext, changes: readonly PluginChange[], index: number, notes: string[]): Picker {
  const change = changes[index]!;
  const verb = change.enable ? 'Enable' : 'Disable';
  return {
    title: `Confirm ${verb.toLowerCase()} ${change.name}`,
    form: 'panel',
    empty: '',
    filterable: false,
    async load(): Promise<readonly Option[]> {
      return [
        { id: 'apply', label: `${verb} ${change.name}`, detail: 'Runs the existing extension command; no other plugin changes.' },
        { id: 'skip', label: 'Skip this change', detail: 'Leave this plugin as it is' },
        { id: 'cancel', label: 'Cancel remaining changes', detail: 'No further changes are applied' },
      ];
    },
    async apply(ids): Promise<PickerOutcome | undefined> {
      const choice = ids[0];
      if (choice === 'cancel') return { note: [...notes, 'Remaining plugin changes were cancelled.'].join('\n') };
      if (choice === 'apply') {
        if (context.extensionCommand) notes.push((await context.extensionCommand('plugin', [change.enable ? 'enable' : 'disable', change.name], context)).output);
        else {
          const result = await runPluginCommand([change.enable ? 'enable' : 'disable', change.name], context);
          if (result.kind === 'local') notes.push(result.output);
        }
      }
      return index + 1 < changes.length
        ? { next: confirmChange(context, changes, index + 1, notes) }
        : { note: notes.length > 0 ? notes.join('\n') : 'No plugin changes.' };
    },
  };
}

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
      const changes: PluginChange[] = [];
      if (context.extensionCommand) {
        for (const plugin of readState().packages) {
          const enabled = plugin.activation[rootIdentity(context.cwd)]?.enabled === true;
          const shouldEnable = wanted.has(plugin.name);
          if (enabled !== shouldEnable) changes.push({ name: plugin.name, enable: shouldEnable });
        }
      } else {
        for (const plugin of getInstalledPlugins()) {
          const shouldEnable = wanted.has(plugin.name);
          if (shouldEnable !== plugin.enabled) changes.push({ name: plugin.name, enable: shouldEnable });
        }
      }
      if (changes.length === 0) return { note: context.extensionCommand ? 'No extension changes.' : 'No plugin changes.' };
      return { next: confirmChange(context, changes, 0, []) };
    },
  };
}
