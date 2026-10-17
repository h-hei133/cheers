import { connectSyntax } from "./syntax.js";
import { syntaxHelp } from "../syntax/projection.js";
import {
  readUserRuntimeConfigFile,
  type ProviderConnectionConfig, type RuntimeConfigFile,
} from "../../../config/runtimeConfig.js";
import { needsUserEndpoint } from "../../providers/facts.js";
import { endpointLabel } from "../../models/availability.js";
import {
  CONNECT_PRESETS,
  normalizeConnections,
} from "./preset.js";

export function renderApiKeyCredentialSummary(apiKey?: string): string {
  if (!apiKey?.trim()) {
    return "api-key:missing";
  }
  return "api-key:redacted";
}

export function maskClientId(clientId: string): string {
  const trimmed = clientId.trim();
  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 3)}***`;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function renderPresetCatalog(): string {
  const lines: string[] = [];
  lines.push("Connect presets");
  for (const preset of CONNECT_PRESETS) {
    lines.push(
      `- ${preset.id}: provider=${preset.provider}${preset.defaultBaseUrl ? `, baseUrl=${preset.defaultBaseUrl}` : ""}${preset.defaultModel ? `, model=${preset.defaultModel}` : ""}`,
    );
  }
  lines.push("");
  lines.push("Auth contracts:");
  lines.push("- api-key connection: /connect login <provider> --api-key <key>");
  lines.push("- account-auth connection: /connect login openai --account");
  lines.push("- browser-assisted local capture: /connect login <provider> --browser");
  return lines.join("\n");
}

export function renderConnectionStatus(userConfig: Pick<RuntimeConfigFile, "provider" | "activeProviderConnectionId"> & { readonly providerConnections?: readonly ProviderConnectionConfig[] } = readUserRuntimeConfigFile()): string {
  const connections = normalizeConnections(userConfig);
  const activeId = userConfig.activeProviderConnectionId?.trim();

  const lines: string[] = [];
  lines.push("Provider connections");
  lines.push(
    `Active connection: ${activeId ? activeId : "none"}${userConfig.provider ? ` (provider=${userConfig.provider})` : ""}`,
  );

  if (connections.length === 0) {
    lines.push("");
    lines.push("No saved connections.");
    lines.push(
      "Use /connect login openai --account, /connect login google --account, or /connect login <provider> --api-key <key>.",
    );
    lines.push("");
    lines.push(...renderReadinessGuidance({ connections, activeId }));
    return lines.join("\n");
  }

  lines.push("");
  for (const connection of connections) {
    const marker = connection.id === activeId ? "*" : " ";
    const label = connection.label?.trim() || connection.provider;
    lines.push(
      `${marker} ${connection.id}  [${connection.provider}]  ${label}  ${connection.authType}  ${connection.status ?? "connected"}`,
    );
    if (connection.authType === "account-auth") {
      const openaiAccount = connection.accountAuth?.openai;
      const googleAccount = connection.accountAuth?.google;
      lines.push(
        `    credential=account-auth${openaiAccount?.accountId ? ` accountId=${openaiAccount.accountId}` : ""}${googleAccount?.accountEmail ? ` email=${googleAccount.accountEmail}` : ""}${googleAccount?.clientId ? ` clientId=${maskClientId(googleAccount.clientId)}` : ""}${endpointLabel(connection.baseUrl) ? ` endpoint=${endpointLabel(connection.baseUrl)}` : ""}${connection.model ? ` model=${connection.model}` : ""}`,
      );
    } else {
      lines.push(
        `    credential=${renderApiKeyCredentialSummary(connection.apiKey)}${endpointLabel(connection.baseUrl) ? ` endpoint=${endpointLabel(connection.baseUrl)}` : ""}${connection.model ? ` model=${connection.model}` : ""}`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Use /connect use <connection-id> to switch runtime provider context.",
  );
  lines.push("");
  lines.push(...renderReadinessGuidance({ connections, activeId }));
  return lines.join("\n");
}

export function renderReadinessGuidance(input: {
  readonly connections: readonly ProviderConnectionConfig[];
  readonly activeId?: string;
}): string[] {
  const activeConnection = input.connections.find(
    (connection) => connection.id === input.activeId,
  );
  const lines = ["Provider readiness"];

  if (input.connections.length === 0) {
    lines.push("- Config status: not configured.");
    lines.push(
      "- Next: run /connect login <provider> --api-key <key> or /connect login openai --account.",
    );
    return lines;
  }

  if (!input.activeId) {
    lines.push("- Config status: no active connection selected.");
    lines.push("- Next: run /connect use <connection-id|provider>.");
    return lines;
  }

  if (!activeConnection) {
    lines.push(
      `- Config status: active connection not found (${input.activeId}).`,
    );
    lines.push("- Next: run /connect status, then /connect use <connection-id>.");
    return lines;
  }

  const missingCredential =
    activeConnection.authType !== "account-auth" &&
    !activeConnection.apiKey?.trim();
  const missingBaseUrl =
    needsUserEndpoint(activeConnection.provider) &&
    !activeConnection.baseUrl?.trim();
  const missingModel =
    needsUserEndpoint(activeConnection.provider) &&
    !activeConnection.model?.trim();

  if (activeConnection.status === "pending") {
    lines.push("- Config status: connection setup is pending.");
    lines.push("- Next: finish the login/browser flow or rerun /connect login.");
    return lines;
  }

  if (activeConnection.status === "error") {
    lines.push("- Config status: connection setup is in error state.");
    lines.push("- Next: rerun /connect login for this provider.");
    return lines;
  }

  if (missingCredential) {
    lines.push("- Config status: credential missing for active connection.");
    lines.push(
      `- Next: run /connect login ${activeConnection.provider} --api-key <key>.`,
    );
    return lines;
  }

  if (missingBaseUrl || missingModel) {
    lines.push(
      `- Config status: ${activeConnection.provider} requires ${[
        missingBaseUrl ? "base URL" : null,
        missingModel ? "model" : null,
      ]
        .filter(Boolean)
        .join(" and ")}.`,
    );
    lines.push(
      `- Next: run /connect login ${activeConnection.provider} --api-key <key> --base-url <url> --model <model>.`,
    );
    return lines;
  }

  lines.push(
    "- Config status: configured. Credentials are redacted; live endpoint was not checked by /connect status.",
  );
  lines.push(
    "- Live check: run npm run verify:provider-readiness from the project root.",
  );
  lines.push(
    "- If the live check reports provider-network-inconclusive: retry later or check proxy/firewall/network; do not treat it as a coding capability failure.",
  );
  return lines;
}

export function getConnectHelpText(): string {
  return [
    syntaxHelp(connectSyntax),
    "Provider connect and onboarding commands",
    "/connect status|list",
    "/connect presets",
    "/connect login <provider|preset> --api-key <key> [--base-url <url>] [--model <model>] [--label <name>]",
    "/connect set <provider|preset> <api-key> [base-url] [model]       (legacy /auth set compatibility)",
    "/connect login openai --account [--label <name>]                 (real ChatGPT account login)",
    "/connect login google --account [--label <name>]                 (Google OAuth; requires GOOGLE_OAUTH_CLIENT_ID)",
    "/connect login <provider|preset> --browser [--label <name>]      (browser-assisted local key capture)",
    "/connect use <connection-id|provider>",
    "/connect logout <connection-id|provider>",
    "",
    "Providers: openai | anthropic | openai-compatible | siliconflow | google | antigravity | claudecode",
    "Examples:",
    "- /connect login siliconflow --api-key sk-xxxx",
    "- /connect login google --api-key <key>",
    "- /connect login google --account   (requires GOOGLE_OAUTH_CLIENT_ID env)",
    "- /connect login antigravity --api-key <key> --base-url <url> --model <model>",
    "- /connect login openai --account",
    "- /connect login openai --api-key sk-xxxx --model gpt-4.1-mini",
    "- /connect status",
  ].join("\n");
}
