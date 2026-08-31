import { matchesKey } from "./keys.js";

export type ActionId =
  | "app.interrupt"
  | "app.tools.expand"
  | "app.thinking.toggle"
  | "app.model.cycle"
  | "tui.select.up"
  | "tui.select.down"
  | "tui.select.confirm"
  | "tui.select.cancel";

export interface KeybindingDefinition {
  readonly defaultKeys: readonly string[];
  readonly description: string;
}

const DEFAULT_KEYBINDINGS: Record<ActionId, KeybindingDefinition> = {
  "app.interrupt": {
    defaultKeys: ["ctrl+c", "escape"],
    description: "Interrupt current tool execution or cancel input",
  },
  "app.tools.expand": {
    defaultKeys: ["ctrl+o"],
    description: "Expand or collapse tool output cards",
  },
  "app.thinking.toggle": {
    defaultKeys: ["ctrl+t"],
    description: "Toggle thinking / reasoning chain visibility",
  },
  "app.model.cycle": {
    defaultKeys: ["ctrl+p"],
    description: "Cycle through configured model presets",
  },
  "tui.select.up": {
    defaultKeys: ["up", "k"],
    description: "Navigate up in selection lists",
  },
  "tui.select.down": {
    defaultKeys: ["down", "j"],
    description: "Navigate down in selection lists",
  },
  "tui.select.confirm": {
    defaultKeys: ["enter"],
    description: "Confirm active selection",
  },
  "tui.select.cancel": {
    defaultKeys: ["escape"],
    description: "Cancel active selection modal",
  },
};

export class KeybindingsManager {
  private static instance?: KeybindingsManager;
  private readonly definitions = new Map<string, KeybindingDefinition>();
  private readonly userOverrides = new Map<string, string[]>();

  constructor() {
    for (const [action, def] of Object.entries(DEFAULT_KEYBINDINGS)) {
      this.definitions.set(action, def);
    }
  }

  static getShared(): KeybindingsManager {
    if (!KeybindingsManager.instance) {
      KeybindingsManager.instance = new KeybindingsManager();
    }
    return KeybindingsManager.instance;
  }

  registerAction(action: string, def: KeybindingDefinition): void {
    this.definitions.set(action, def);
  }

  setUserOverrides(overrides: Record<string, string | string[]>): void {
    this.userOverrides.clear();
    for (const [action, keys] of Object.entries(overrides)) {
      const normalizedKeys = Array.isArray(keys) ? keys : [keys];
      this.userOverrides.set(action, normalizedKeys.map((k) => k.toLowerCase().trim()));
    }
  }

  getKeysForAction(action: string): string[] {
    const override = this.userOverrides.get(action);
    if (override && override.length > 0) {
      return override;
    }
    return [...(this.definitions.get(action)?.defaultKeys ?? [])];
  }

  matches(data: string, action: string): boolean {
    const keys = this.getKeysForAction(action);
    return keys.some((expectedKey) => matchesKey(data, expectedKey));
  }
}

export const keybindings = KeybindingsManager.getShared();
