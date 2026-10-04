import { schema } from "../themes/assets.js";

export type ThemeColorToken = keyof typeof schema.properties.colors.properties;

export const THEME_COLOR_TOKENS = Object.keys(schema.properties.colors.properties) as ThemeColorToken[];
