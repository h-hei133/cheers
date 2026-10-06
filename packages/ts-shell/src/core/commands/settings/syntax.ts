import type { CommandSyntax } from "../syntax/model.js";
import { CONFIG_SETTINGS } from '../../../config/settings.js';

export const settingsSyntax: CommandSyntax = {
  name: "settings", defaultAction: "", flags: [],
  actions: [
    { name: "", summary: "describe settings available in the panel" },
    ...CONFIG_SETTINGS.map(setting => ({ name: setting.key, summary: setting.description })),
  ],
};
