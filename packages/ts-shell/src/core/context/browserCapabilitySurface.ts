import {
  createBrowserCapabilityState,
  sanitizeBrowserText,
  type BrowserCapabilityState,
} from "./browserCapabilityModel.js";
import {
  browserRuntimeDependencySummary,
  renderBrowserRuntimeAvailabilitySurface,
} from "../../browser/runtime/core/availabilitySurface.js";

export function renderBrowserCapabilitySurface(
  state: BrowserCapabilityState = createBrowserCapabilityState(),
): string {
  return [
    "Browser capability status",
    "Result",
    "- Outcome: preview-only",
    `- Browser capability: ${state.status}`,
    `- Active backend: ${state.activeBackend}`,
    "- Executed: no",
    "- Browser process: not launched",
    "- MCP discovery/launch: none",
    "- Provider/model call: none",
    "- Persistence: none",
    "- External-network bridge: disabled by default",
    `- Preview actions: ${state.supportedPreviewActions.join(", ")}`,
    `- Blocked actions: ${state.blockedActions.join(", ")}`,
    "",
    renderBrowserRuntimeAvailabilitySurface({
      availability: "unavailable",
      currentMode: "status",
    }),
    "",
    "Backend candidates:",
    ...state.backendCandidates.map((backend) =>
      `- ${sanitizeBrowserText(backend.label)}: ${backend.status} - ${sanitizeBrowserText(backend.summary)}`
    ),
    "",
    "Safety:",
    "- Preview-only; no website navigation, browser session, screenshot, OCR, download, upload, auth, payment, or destructive automation.",
    "- Raw content/secrets/hidden reasoning: excluded",
    "- DoNext: Use /browser preview navigate <url>, extract <goal>, click <target>, or type <target> <text>.",
  ].join("\n");
}

export function browserCapabilitySidebarToolItem(
  state: BrowserCapabilityState = createBrowserCapabilityState(),
) {
  return {
    id: "browser",
    label: "Browser capability",
    status: state.status === "blocked" || state.status === "unavailable"
      ? "unavailable" as const
      : "deferred" as const,
    summary: `${state.status}; ${browserRuntimeDependencySummary()}; external-network bridge disabled by default; no browser/MCP launch or provider/model call.`,
    evidence: [
      "browser-capability-surface:sidebar-placeholder",
      "browser-capability-surface:no-discovery",
      "browser-capability-surface:no-browser-execution",
      "browser-capability-surface:runtime-dependency-policy",
    ],
  };
}
