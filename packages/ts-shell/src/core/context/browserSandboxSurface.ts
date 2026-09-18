import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserRuntimePreflight } from "../../browser/runtime/core/preflight.js";

export function renderBrowserSandboxSurface(
  preflight: BrowserRuntimePreflight,
  executed = false,
): string {
  return [
    "Browser sandbox preflight",
    `- Preflight status: ${preflight.preflightStatus}`,
    `- Sandbox authority: ${preflight.sandboxDecision.authority.mode}`,
    `- Network allowlist: ${preflight.networkDecision.status}`,
    `- Confirmation status: ${preflight.confirmationDecision.status}`,
    `- Evidence requirements: ${preflight.evidenceRequirements.slice(0, 5).map((item) => sanitizeBrowserText(item)).join("; ")}`,
    `- Blockers/warnings: ${renderBlockers(preflight)}`,
    `- Executed: ${executed ? "yes" : "no"}`,
    `- Next action: ${sanitizeBrowserText(preflight.nextAction)}`,
  ].join("\n");
}

function renderBlockers(preflight: BrowserRuntimePreflight): string {
  const values = [...preflight.blockers, ...preflight.warnings];
  return values.length > 0
    ? values.slice(0, 4).map((item) => sanitizeBrowserText(item)).join("; ")
    : "none";
}
