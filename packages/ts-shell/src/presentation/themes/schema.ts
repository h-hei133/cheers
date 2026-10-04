import { schema } from "./assets.js";
import { COLOR_NAMES } from "../theme/color.js";
import { isRecord } from "../../core/values/record.js";

export interface ThemeConfig {
  name: string;
  description: string;
  colors: Record<string, string>;
}

/** New semantic roles inherit the former role for existing theme files. */
const INHERITED_TOKENS = {
  "syntaxText": "text",
  "syntaxKeyword": "commandFlag",
  "syntaxString": "commandString",
  "syntaxNumber": "commandNumber",
  "syntaxComment": "muted",
  "syntaxFunction": "toolTitle",
  "syntaxType": "accent",
  "syntaxVariable": "filename",
  "syntaxMeta": "dim",
  "syntaxBuiltin": "command",
  "mdLinkUrl": "dim",
  "mdQuoteText": "dim",
  "mdQuoteBorder": "border",
  "mdListBullet": "accent",
  "mdRule": "border",
  "mdCodeBorder": "border"
} as const;

/** Structural validation plus variable resolution; omitted tokens inherit a usable palette. */
export function parseTheme(parsed: unknown, fallbackName: string, defaults: ThemeConfig): ThemeConfig {
  if (!isRecord(parsed)) throw new Error("Theme must be an object.");
  for (const key of Object.keys(parsed)) {
    if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown theme field: ${key}`);
  }
  for (const key of ["name", "description", "$schema"] as const) {
    if (parsed[key] !== undefined && typeof parsed[key] !== "string") throw new Error(`${key} must be a string.`);
  }
  if (!isRecord(parsed.colors)) throw new Error("Theme colors must be an object.");
  if (parsed.vars !== undefined && !isRecord(parsed.vars)) throw new Error("Theme vars must be an object.");
  const vars = (parsed.vars ?? {}) as Record<string, unknown>;
  const resolved = new Map<string, string>();
  for (const name of Object.keys(vars)) resolveColor(name, vars, resolved);
  const colors = { ...defaults.colors };
  for (const [token, value] of Object.entries(parsed.colors)) {
    if (!Object.hasOwn(schema.properties.colors.properties, token)) throw new Error(`Unknown color token: ${token}`);
    colors[token] = resolveColor(value, vars, resolved);
  }
  for (const [token, previous] of Object.entries(INHERITED_TOKENS)) {
    if (!Object.hasOwn(parsed.colors, token)) colors[token] = colors[previous]!;
  }
  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : fallbackName,
    description: typeof parsed.description === "string" ? parsed.description : "",
    colors,
  };
}

/** Iterative resolution bounds stack use even for a long variable chain. */
function resolveColor(value: unknown, vars: Record<string, unknown>, resolved: Map<string, string>): string {
  const visiting = new Set<string>();
  let current = value;
  while (typeof current === "string" && Object.hasOwn(vars, current)) {
    const cached = resolved.get(current);
    if (cached !== undefined) { current = cached; break; }
    if (visiting.has(current)) throw new Error(`Circular color variable: ${current}`);
    visiting.add(current);
    current = vars[current];
  }
  if (typeof current !== "string" || !(/^#[\da-f]{6}$/i.test(current) || (COLOR_NAMES as readonly string[]).includes(current.toLowerCase()))) {
    throw new Error(`Invalid color or missing variable: ${String(current)}`);
  }
  for (const name of visiting) resolved.set(name, current);
  return current;
}
