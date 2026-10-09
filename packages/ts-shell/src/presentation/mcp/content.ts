import type { McpContentResponse, McpNotificationSnapshot } from "../../core/mcp/content/types.js";
import { redactReportText } from "../../core/security/redaction.js";
import { neutraliseForDisplay } from "../../core/text/safety.js";

const MAX_DISPLAY = 48_000;

/** Display remote data as report text, with source identity and explicit omissions. */
export function renderMcpContent(response: McpContentResponse): string {
  const { result } = response;
  const lines = [`MCP ${result.kind} @ ${response.serverName} (scope=${response.scope}, transport=${response.transport})`];
  if (result.kind === "unsupported") lines.push(`Server did not advertise ${result.capability}; no request sent.`);
  else if (result.kind === "resources") {
    lines.push(...result.items.map(item => `${item.uri} — ${item.name}${item.description ? `: ${item.description}` : ""}`));
    if (!result.items.length) lines.push("No resources in the complete catalog.");
  } else if (result.kind === "templates") {
    lines.push(...result.items.map(item => `${item.uriTemplate} — ${item.name}${item.description ? `: ${item.description}` : ""}`));
    if (!result.items.length) lines.push("No resource templates in the complete catalog.");
  } else if (result.kind === "prompts") {
    for (const item of result.items) lines.push(`${item.name}${item.description ? `: ${item.description}` : ""}`,
      ...((item.arguments ?? []).map(arg => `  ${arg.name}${arg.required ? " (required)" : " (optional)"}${arg.description ? `: ${arg.description}` : ""}`)));
    if (!result.items.length) lines.push("No prompts in the complete catalog.");
  } else if (result.kind === "read") {
    for (const item of result.value.contents) lines.push(`[${item.uri}${item.mimeType ? `; ${item.mimeType}` : ""}]`,
      "text" in item ? item.text : "[Binary resource omitted from text display]");
  } else if (result.kind === "prompt") {
    lines.push("Prompt preview only; no model request or tool execution.");
    if (result.value.description) lines.push(result.value.description);
    for (const message of result.value.messages) {
      const block = message.content;
      lines.push(`[${message.role}]`, block.type === "text" ? block.text
        : block.type === "resource" && "text" in block.resource ? `${block.resource.uri}\n${block.resource.text}`
        : block.type === "resource_link" ? `${block.name}: ${block.uri}` : `[${block.type} content omitted from text display]`);
    }
  } else lines.push(`${result.kind === "subscribe" ? "Subscribed" : "Unsubscribed"}: ${result.uri}. Applies to this connection only.`);
  return report(lines.join("\n"));
}

export function renderMcpNotifications(snapshots: readonly McpNotificationSnapshot[]): string {
  const lines = ["MCP notifications (current connections; metadata only, message bodies omitted)"];
  if (!snapshots.length) lines.push("No selected MCP servers.");
  for (const snapshot of snapshots) {
    lines.push(`${snapshot.serverName}: ${snapshot.state}; retained=${snapshot.entries.length}, dropped=${snapshot.dropped}`);
    for (const item of snapshot.entries) lines.push(`  ${item.sequence} ${item.receivedAt} ${item.method}${item.level ? ` level=${item.level}` : ""}`);
  }
  return report(lines.join("\n"));
}

function report(value: string): string {
  const redactions = new Set<string>();
  const text = redactReportText(value, MAX_DISPLAY, { preserveLines: true, redactions }).split("\n").map(neutraliseForDisplay).join("\n");
  return text + (redactions.has("unsafe-content") ? "\n[Redacted content]" : "")
    + (redactions.has("truncated") ? "\n[Display truncated; this is not the complete content]" : "");
}
