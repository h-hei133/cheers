import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { PwRuntimeStatus } from "./pwRuntime.js";

export function renderPwRuntimeStatus(status: PwRuntimeStatus): string {
  return [
    "Direct Playwright",
    `- Status: ${status.status}`,
    `- Dependency: ${status.dependency}`,
    `- Browser: ${status.browserName}`,
    `- Real browser validation: ${status.realBrowserValidationAvailable ? "available" : "unavailable"}`,
    `- Browser launched during status: ${status.browserLaunched ? "yes" : "no"}`,
    "- Default runtime: disabled",
    "- MCP backend: optional-not-default",
    "- Provider/model call: none",
    `- Reason: ${sanitizeBrowserText(status.reason, 220)}`,
    `- Skip reason: ${status.skipReason ? sanitizeBrowserText(status.skipReason, 120) : "none"}`,
    `- Next action: ${sanitizeBrowserText(status.nextAction, 220)}`,
  ].join("\n");
}
