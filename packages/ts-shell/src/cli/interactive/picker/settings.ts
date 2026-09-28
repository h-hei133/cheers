import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/** What the settings picker needs from its host. */
export interface SettingsHost {
  /** The stored value of a toggle, or its default when nothing is stored. */
  readSetting(key: "attentionOnIdle" | "offline"): boolean;
  /** Persist a toggle; the host owns where that lives. */
  saveSetting(key: "attentionOnIdle" | "offline", value: boolean): Promise<void>;
}

/**
 * Runtime settings chooser.
 *
 * Only the settings that are safe to flip mid-session live here — the ones
 * whose next effect is a preference rather than a credential. Complex values
 * stay in the file, where a text editor beats a list of buttons; this panel
 * is for the switches a user reaches for while working.
 */

/** One setting the panel can show and change. */
interface ToggleSetting {
  readonly key: "attentionOnIdle" | "offline";
  readonly label: string;
  readonly describe: string;
  readonly onText: string;
  readonly offText: string;
}

const TOGGLES: readonly ToggleSetting[] = [
  {
    key: "attentionOnIdle",
    label: "Attention on idle",
    describe: "Bell and desktop notification when a long turn finishes",
    onText: "on — signal after 30s turns",
    offText: "off — never signal",
  },
  {
    key: "offline",
    label: "Offline",
    describe: "Skip requests this session makes on its own initiative",
    onText: "on — no self-initiated requests",
    offText: "off — refreshes and checks allowed",
  },
];

export function settingsPicker(host: SettingsHost): Picker {
  return {
    title: "Settings",
    form: "panel",
    empty: "No settings available.",
    async load(): Promise<readonly Option[]> {
      const options: Option[] = [];
      for (const toggle of TOGGLES) {
        const current = host.readSetting(toggle.key);
        for (const value of [true, false]) {
          options.push({
            id: `${toggle.key}:${value}`,
            label: `${toggle.label} — ${value ? toggle.onText : toggle.offText}`,
            detail: toggle.describe,
            selected: current === value,
          });
        }
      }
      return options;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      // One row per toggle is what the multiple form means here; taking the
      // last-seen keeps a careless double-tick from silently winning.
      const written: string[] = [];
      for (const toggle of TOGGLES) {
        const chosen = ids.find((id) => id.startsWith(`${toggle.key}:`));
        if (chosen === undefined) continue;
        const value = chosen.endsWith(":true");
        await host.saveSetting(toggle.key, value);
        written.push(`${toggle.label}: ${value ? "on" : "off"}`);
      }
      return { note: written.length > 0 ? `Settings saved — ${written.join(", ")}\nRestart or /reload applies them to the next run.` : undefined };
    },
  };
}
