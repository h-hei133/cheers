import schema from "../themes/schema.json" with { type: "json" };

export type ThemeColorToken = keyof typeof schema.properties.colors.properties;

export const THEME_COLOR_TOKENS = Object.keys(schema.properties.colors.properties) as ThemeColorToken[];
