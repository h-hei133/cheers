import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";
import { syntaxCompletions } from "../syntax/projection.js";
import { CONNECT_PRESETS, resolveProviderTarget } from "./preset.js";

const provider = { name: "provider", kind: "text", required: true } as const;
const connection = { name: "connection-id|provider", kind: "text", required: true } as const;
export const connectSyntax: CommandSyntax = {
  name: "connect", defaultAction: "help", flags: [],
  actions: [
    { name: "help", summary: "show connection usage" },
    { name: "status", aliases: ["list"], summary: "inspect saved connections" },
    { name: "presets", summary: "list provider presets" },
    { name: "login", summary: "create a provider connection", parameters: [provider], flags: [
      { name: "api-key", aliases: ["key"], kind: "text", summary: "use an API key", conflicts: ["account", "browser"] },
      { name: "account", kind: "boolean", summary: "start supported account authentication", conflicts: ["api-key", "browser", "base-url", "model"] },
      { name: "browser", kind: "boolean", summary: "capture a key with a local browser", conflicts: ["api-key", "account", "base-url", "model"] },
      { name: "base-url", kind: "text", summary: "set the API endpoint", conflicts: ["account", "browser"] },
      { name: "model", kind: "text", summary: "set the connection model", conflicts: ["account", "browser"] },
      { name: "label", kind: "text", summary: "label this connection" },
    ] },
    { name: "set", summary: "set a key using the positional compatibility form", parameters: [provider, { name: "api-key", kind: "text", required: true }, { name: "base-url", kind: "text" }, { name: "model", kind: "text" }] },
    { name: "use", aliases: ["activate"], summary: "activate a saved connection", parameters: [connection] },
    { name: "logout", aliases: ["remove", "rm"], summary: "remove a saved connection", parameters: [connection] },
  ],
};

export function parseConnectArgs(args: readonly string[]) {
  const parsed = parseSyntax(connectSyntax, args);
  if (parsed.ok && (parsed.action.name === "login" || parsed.action.name === "set") && !resolveProviderTarget(parsed.args[0])) return { ok: false as const, reason: "Unknown provider or preset." };
  return parsed;
}

export function connectCompletions(prefix: string) {
  const values = [...CONNECT_PRESETS.map(preset => preset.id), "openai-compatible", "gemini"];
  return syntaxCompletions({ ...connectSyntax, actions: connectSyntax.actions.map(action => action.name === "login" || action.name === "set"
    ? { ...action, parameters: action.parameters?.map(parameter => parameter.name === "provider" ? { ...parameter, values } : parameter) } : action) }, prefix);
}
