import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import type { SettingKey, SettingsDraft } from "../settings.js";

/** What the settings picker needs from its host. */
export interface SettingsHost {
  openSettings(): SettingsDraft;
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
  readonly key: SettingKey;
  readonly label: string;
  readonly describe: string;
  readonly onText: string;
  readonly offText: string;
}

const TOGGLES: readonly ToggleSetting[] = [
  {
    key: "attentionOnIdle",
    label: "Attention on idle",
    describe: "Bell and notification sequence after a long operation; desktop display depends on your terminal",
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
  let draft: SettingsDraft | undefined;
  return {
    title: "Settings — save to user configuration",
    form: "panel",
    empty: "Settings could not be loaded. Check your configuration and retry.",
    async load(): Promise<readonly Option[]> {
      draft = host.openSettings();
      const options: Option[] = [];
      for (const toggle of TOGGLES) {
        const current = draft.values[toggle.key];
        for (const value of [true, false]) {
          options.push({
            id: `${toggle.key}:${value}`,
            label: `${toggle.label} — ${value ? 'on' : 'off'}`,
            detail: `${value ? toggle.onText : toggle.offText}. ${toggle.describe}. Enter saves this choice.`,
            note: `Current ${current.effective ? 'on' : 'off'} · user ${current.stored === undefined ? 'unset' : current.stored ? 'on' : 'off'}`,
            selected: current.effective === value,
          });
        }
      }
      return options;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (!draft || ids.length !== 1) return undefined;
      const toggle = TOGGLES.find(item => ids[0] === `${item.key}:true` || ids[0] === `${item.key}:false`);
      if (!toggle) return undefined;
      const note = await draft.save(toggle.key, ids[0] === `${toggle.key}:true`);
      return { note: `${toggle.label}: ${note}` };
    },
  };
}
