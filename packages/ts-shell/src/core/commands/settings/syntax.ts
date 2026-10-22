import type { CommandSyntax } from "../syntax/model.js";
import { CONFIG_SETTINGS } from '../../../config/settings.js';

export const settingsSyntax: CommandSyntax = {
  name: "settings", defaultAction: "", flags: [],
  actions: [
    { name: "", summary: "describe settings available in the panel" },
    { name: "set", summary: "explicitly save one setting; use --project for project scope",
      parameters: [{ name: "key", kind: "text", required: true }, { name: "value", kind: "text", rest: true, required: true }],
      flags: [{ name: "project", kind: "boolean", summary: "write the project configuration" }] },
    ...CONFIG_SETTINGS.map(setting => ({ name: setting.key, summary: setting.description })),
  ],
};
