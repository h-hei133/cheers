import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExternalNetworkExecutionBridgeResult } from "./browserExternalNetworkExecutionBridge.js";
import { renderBrowserExternalNetworkHandoffSurface } from "./browserExternalNetworkHandoffSurface.js";
import { renderBrowserControlledNetworkSurface } from "./browserControlledNetworkSurface.js";

export function renderBrowserExternalNetworkExecutionSurface(
  result: BrowserExternalNetworkExecutionBridgeResult,
): string {
  return [
    "External browser execution",
    `- Outcome: ${result.status}`,
    `- Origin: ${safe(result.receipt.targetOrigin)}`,
    `- Action: ${safe(result.receipt.actionKind)}`,
    `- Gate status: sandbox=${result.receipt.sandboxStatus}; allowlist=${result.receipt.allowlistStatus}; confirmation=${result.receipt.confirmationStatus}; preflight=${result.receipt.preflightStatus}`,
    `- Runner status: ${result.receipt.externalRunnerStatus}`,
    `- Runner manifest: ${result.receipt.externalNetworkRunnerManifestStatus}`,
    `- Handoff status: ${result.receipt.handoffStatus ?? "none"}`,
    `- Controlled-network manifest: ${result.receipt.controlledNetworkRunnerManifestStatus}`,
    `- Controlled-network status: ${result.receipt.controlledNetworkStatus ?? "none"}`,
    `- Risk receipt: ${safe(result.receipt.receiptId, 180)}`,
    `- Risk level: ${result.receipt.riskLevel}`,
    `- Executed: ${result.receipt.executed ? "yes" : "no"}`,
    "- Browser process: not launched",
    `- Network access: ${result.controlledNetworkReceipt?.executed ? "controlled-loopback" : "none"}`,
    "- MCP discovery/launch: none",
    "- Provider/model call: none",
    "- Raw content: excluded",
    `- Blockers: ${result.receipt.blockedReasons.length === 0 ? "none" : result.receipt.blockedReasons.map((item) => safe(item)).join("; ")}`,
    `- Redactions: ${result.receipt.redactions.length === 0 ? "none" : result.receipt.redactions.join(", ")}`,
    `- Next action: ${safe(result.receipt.nextAction, 240)}`,
    ...(result.handoffReceipt
      ? [
          "",
          renderBrowserExternalNetworkHandoffSurface(result.handoffReceipt),
        ]
      : []),
    ...(result.controlledNetworkReceipt
      ? [
          "",
          renderBrowserControlledNetworkSurface(result.controlledNetworkReceipt),
        ]
      : []),
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}
