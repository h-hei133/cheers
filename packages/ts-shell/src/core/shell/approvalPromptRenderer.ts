import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { EscalationPrompt } from "../../sandbox/index.js";

export interface ApprovalAuditRecord {
  readonly channel: "interactive" | "non-interactive";
  readonly decision: "deny" | "allow-once" | "allow-always";
  readonly decisionSource: string;
  readonly persistent: boolean;
  readonly cacheEffect:
    | "none"
    | "allow-once-cache-consumed"
    | "allow-always-persisted"
    | "allow-always-cache-hit"
    | "ambiguous-stop";
  readonly projectRoot: string;
  readonly cacheKey: string;
  readonly scopeLabel: string;
  readonly lineage?: string;
  readonly inputKey?: string;
  readonly stopReason?: string;
}

export function renderApprovalAuditRecord(
  renderer: StreamingRenderer,
  record: ApprovalAuditRecord,
): void {
  renderer.renderLine("approval-audit:event=decision");
  renderer.renderLine(`approval-audit:channel=${record.channel}`);
  renderer.renderLine(`approval-audit:decision=${record.decision}`);
  renderer.renderLine(
    `approval-audit:decision-source=${record.decisionSource}`,
  );
  renderer.renderLine(
    `approval-audit:persistent=${record.persistent ? "true" : "false"}`,
  );
  renderer.renderLine(`approval-audit:cache-effect=${record.cacheEffect}`);
  renderer.renderLine(`approval-audit:project-root=${record.projectRoot}`);
  renderer.renderLine(`approval-audit:cache-key=${record.cacheKey}`);
  renderer.renderLine(`approval-audit:scope=${record.scopeLabel}`);
  if (record.lineage) {
    renderer.renderLine(`approval-audit:lineage=${record.lineage}`);
  }
  if (record.inputKey) {
    renderer.renderLine(`approval-audit:input-key=${record.inputKey}`);
  }
  if (record.stopReason) {
    renderer.renderLine(`approval-audit:stop-reason=${record.stopReason}`);
  }
}

export function renderApprovalHeader(
  renderer: StreamingRenderer,
  mode: "approval-required" | "cached-approval",
): void {
  if (mode === "cached-approval") {
    renderer.renderLine("\nApproval");
    renderer.renderLine("- Mode: cached grant");
    return;
  }
  renderer.renderLine("\nApproval");
  renderer.renderLine("- Mode: user confirmation required");
}

export function renderApprovalPromptFacts(
  renderer: StreamingRenderer,
  input: {
    prompt: EscalationPrompt;
    includeRisk?: boolean;
    decisionSource?: string;
  },
): void {
  renderer.renderLine(`- Tool: ${input.prompt.context.toolName}`);
  renderer.renderLine(`- Action: ${input.prompt.context.operation}`);
  renderer.renderLine(`- Target: ${input.prompt.context.target}`);
  if (input.includeRisk === true) {
    renderer.renderLine(`- Risk: ${input.prompt.severity}`);
  }
  if (input.decisionSource) {
    renderer.renderLine(`- Decision source: ${input.decisionSource}`);
  }
}
