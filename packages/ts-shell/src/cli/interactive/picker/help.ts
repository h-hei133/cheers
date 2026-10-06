import { commandInvocations } from "../../../core/commands/invocation.js";
import { span } from "../../../core/commands/report/projection.js";
import { listSlashCommands, subscribeSlashCommands } from "../../../entrypoints/slashCommandRegistry.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker } from "../overlay.js";

/** A guide choice is a draft, never an executable callback. */
export function helpPicker(): Picker {
  return {
    title: "Slash commands",
    form: "panel",
    empty: "No matching commands",
    footer: "Enter to insert · Esc to close",
    holdInput: true,
    load: async () => helpOptions(),
    subscribe: publish => subscribeSlashCommands(() => publish(helpOptions())),
    apply: async ids => {
      // Resolve against the current registry so a removed extension cannot be
      // inserted by a stale selection. Named invocations retain their semantics.
      const command = helpOptions().find(option => option.id === ids[0]);
      return command ? { draft: `${command.id} ` } : undefined;
    },
  };
}

function helpOptions(): Option[] {
  return listSlashCommands().flatMap(command => {
    const invocations = commandInvocations(command);
    const aliases = invocations.filter(item => item.kind === "alias").map(item => item.invocation).join(" ");
    const scope = command.supportsNonInteractive === undefined ? "registered"
      : command.supportsNonInteractive ? "interactive + print" : "interactive";
    return invocations.filter(item => item.kind !== "alias").map(item => ({
      id: item.invocation,
      label: item.invocation,
      labelRole: "command" as const,
      detail: span(`${item.summary}${item.argumentHint ? ` ${item.argumentHint}` : ""}`).text,
      note: `${item.group} · ${scope}`,
      searchText: item.kind === "command" ? aliases : undefined,
    }));
  });
}
