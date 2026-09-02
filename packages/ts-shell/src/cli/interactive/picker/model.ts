import { readModelCatalog } from "../../../core/commands/modelCommandRuntime.js";
import { runModelCommand } from "../../../core/commands/modelCommandRuntime.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Model chooser.
 *
 * Reads the same catalog `/model list` prints and applies through the same
 * `/model use` path, so a choice made here cannot diverge from a choice typed.
 */
export function modelPicker(context: CommandContext): Picker {
  return {
    title: "Model",
    form: "panel",
    empty: "No models available for the active provider.",
    async load(): Promise<readonly Option[]> {
      const catalog = await readModelCatalog();
      return catalog.models.map<Option>((model) => ({
        id: model,
        label: model,
        detail: model === catalog.active ? "active" : "",
        note: catalog.offline && model === catalog.active ? "offline catalog" : undefined,
      }));
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const model = ids[0];
      if (!model) return undefined;
      const result = await runModelCommand(["use", model], context);
      return result.kind === "local" ? { note: result.output } : undefined;
    },
  };
}
