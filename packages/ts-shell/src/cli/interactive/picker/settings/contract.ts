import type { SettingsScope } from '../../../../config/settings.js';
import type { Picker } from '../../overlay.js';
import type { SettingsDraft } from '../../settings.js';
import type { PreferenceHost } from '../preview.js';

export interface SettingsHost extends PreferenceHost {
  openSettings(scope?: SettingsScope): SettingsDraft;
  modelSettings?(back: (notice?: string) => Picker): Picker;
  thinkingSettings?(back: (notice?: string) => Picker): Picker;
}

export interface StagedValue { readonly value: unknown }
