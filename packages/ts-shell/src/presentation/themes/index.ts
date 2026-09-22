import darkJson from "./dark.json" with { type: "json" };
import lightJson from "./light.json" with { type: "json" };

export interface ThemeConfig {
  name: string;
  description: string;
  colors: Record<string, string>;
}

const registry: Record<string, ThemeConfig> = {
  dark: darkJson,
  light: lightJson,
};

export function listThemes(): string[] {
  return Object.keys(registry);
}

export function loadTheme(name: string): ThemeConfig | undefined {
  return registry[name];
}

export function getDefaultTheme(): ThemeConfig {
  return registry.dark!;
}
