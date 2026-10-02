import {
  getMarketplaceSources,
  runMarketplaceCommand,
  type MarketplaceSource,
} from "../../../core/commands/marketplaceCommandRuntime.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Catalogue source chooser.
 *
 * A source is a place to look for extensions — a git repository or a directory
 * holding a manifest — not a service anyone has to be signed up with. Extensions
 * themselves resolve as packages or paths, so adding a source registers an
 * address and nothing more: no account, no exchange, nothing to revoke.
 */

const ADD_ID = "add";

export function sourcePicker(context: CommandContext): Picker {
  let sources: readonly MarketplaceSource[] = [];
  return {
    title: "Extension sources",
    form: "panel",
    empty: "No sources registered.",
    async load(): Promise<readonly Option[]> {
      try {
        sources = getMarketplaceSources();
      } catch (error) {
        sources = [];
        return [{
          id: "load-error", label: "Could not load extension sources", disabled: true,
          detail: error instanceof Error ? error.message : "Storage unavailable",
        }];
      }
      return [
        ...sources.map<Option>((source) => ({
          id: source.name,
          label: source.name,
          detail: describe(source),
          note: source.isDefault ? "default" : "remove",
        })),
        {
          id: ADD_ID,
          label: "add a source…",
          detail: "a git repository or a local directory holding an extension manifest",
          note: "new",
        },
      ];
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (chosen === ADD_ID) return { draft: "/marketplace add " };
      const source = sources.find((candidate) => candidate.name === chosen);
      if (!source) return undefined;
      // Sources marked default remain read-only in this picker.
      if (source.isDefault) {
        return { note: `\`${source.name}\` is the default source and stays registered.\n\n${describe(source)}` };
      }
      const result = await runMarketplaceCommand(["remove", source.name], context);
      return { note: result.output };
    },
  };
}

function describe(source: MarketplaceSource): string {
  return source.description ? `${source.url} · ${source.description}` : source.url;
}
