import { sanitizeBrowserText } from "./capabilityModel.js";
import type { BrowserNetworkAuditRecord } from "./networkAuditRecord.js";

export function renderBrowserNetworkEgressSurface(record: BrowserNetworkAuditRecord): string {
  return [
    "Browser network egress guard",
    `- Requested origin: ${safe(record.requestedOrigin)}`,
    `- Decision: ${safe(record.egressDecision)}`,
    `- Redirect decision: ${safe(record.redirectDecision ?? "none")}`,
    `- Public network allowed: ${record.publicNetwork ? "yes" : "no"}`,
    `- Controlled network: ${record.controlledNetwork ? "yes" : "no"}`,
    `- Audit id: ${safe(record.auditId)}`,
    `- Warnings/redactions: ${[...record.warnings, ...record.redactions].length === 0 ? "none" : [...record.warnings, ...record.redactions].map((item) => safe(item)).join(", ")}`,
    `- Next action: ${safe(record.nextAction, 240)}`,
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
