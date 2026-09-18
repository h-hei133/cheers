import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserToolServerBackendComparison } from "./browserToolServerBackendComparison.js";
import {
  renderBrowserPlaywrightRuntimeAvailability,
  type BrowserPlaywrightRuntimeAvailability,
} from "./browserPlaywrightRuntimeAvailability.js";
import type { BrowserRuntimeDirectionDecision } from "./runtime/core/directionDecision.js";

export function renderBrowserPlaywrightAdapterSurface(input: {
  readonly availability: BrowserPlaywrightRuntimeAvailability;
  readonly toolServerComparison: BrowserToolServerBackendComparison;
  readonly decision: BrowserRuntimeDirectionDecision;
  readonly tested?: readonly string[];
  readonly notDone?: readonly string[];
}): string {
  return [
    renderBrowserPlaywrightRuntimeAvailability(input.availability),
    "",
    "Playwright backend direction",
    `- tool-server backend: ${input.toolServerComparison.suitability}`,
    `- Recommended core: ${input.decision.recommendedCoreRuntime}`,
    `- Optional backends: ${input.decision.optionalBackends.length > 0 ? input.decision.optionalBackends.join(", ") : "none"}`,
    `- Rejected paths: ${input.decision.rejectedPaths.join(", ")}`,
    `- Tested: ${(input.tested ?? []).map((item) => safe(item, 80)).join(", ") || "none"}`,
    `- Not done: ${(input.notDone ?? defaultNotDone()).map((item) => safe(item, 90)).join(", ")}`,
    `- Next action: ${safe(input.decision.nextAction, 220)}`,
    "- Raw content: excluded",
    "- Provider/model call: none",
    "- tool-server launched: no",
  ].join("\n");
}

function defaultNotDone(): readonly string[] {
  return [
    "no package install",
    "no real browser launch",
    "no tool-server launch",
    "no public automation",
  ];
}

function safe(value: string, maxLength = 160): string {
  return sanitizeBrowserText(value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SECRET]").replace(/\s+/g, " "), maxLength);
}
