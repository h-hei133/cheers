import { sanitizeBrowserText } from "../../../core/context/browserCapabilityModel.js";
import type { BrowserSkillRunnerMetadata } from "./metadata.js";
import type { BrowserSkillRunnerReadiness } from "./readiness.js";

export function renderBrowserSkillRunnerSurface(input: {
  readonly metadata?: BrowserSkillRunnerMetadata;
  readonly readiness?: BrowserSkillRunnerReadiness;
  readonly fallbackReason?: string;
} = {}): string {
  const readiness = input.readiness;
  const metadata = input.metadata;
  return [
    "Skill-managed browser runner",
    `- Skill id/name: ${metadata ? `${sanitizeBrowserText(metadata.skillId, 80)} / ${sanitizeBrowserText(metadata.skillName, 80)}` : "none"}`,
    `- Metadata status: ${metadata?.status ?? readiness?.status ?? "unavailable"}`,
    `- Supported actions: ${metadata?.supportedActions.length ? metadata.supportedActions.join(", ") : "none"}`,
    `- Blocked actions: ${metadata?.blockedActions.length ? metadata.blockedActions.join(", ") : "none"}`,
    `- Evidence contract: ${metadata?.evidenceContract ?? "missing"}`,
    `- Sandbox contract: ${metadata?.sandboxContract ?? "missing"}`,
    `- Replay contract: ${metadata?.replayContract ?? "missing"}`,
    "- Execution: not enabled",
    `- Next action: ${sanitizeBrowserText(readiness?.nextAction ?? input.fallbackReason ?? "Provide explicit skill runner metadata before enabling skill-managed execution.", 180)}`,
  ].join("\n");
}
