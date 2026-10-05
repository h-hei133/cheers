import { syntaxHelp } from "../../core/commands/syntax/projection.js";
import { sidebarSnapshotSyntax } from "./syntax.js";
import { parseSyntax } from "../../core/commands/syntax/parse.js";
import type {
  SidebarPanelBudget,
  SidebarPanelDensity,
} from "./sidebarPanelModel.js";

export interface SidebarLivePanelCommandContract {
  readonly mode: "snapshot";
  readonly density: SidebarPanelDensity;
  readonly frameCount: 1;
  readonly budget?: Partial<SidebarPanelBudget>;
}

export interface SidebarLivePanelCommandParseResult {
  readonly ok: boolean;
  readonly contract?: SidebarLivePanelCommandContract;
  readonly errorOutput?: string;
}

export function parseSidebarLivePanelCommandArgs(
  args: readonly string[],
): SidebarLivePanelCommandParseResult {
  const parsed = parseSyntax(sidebarSnapshotSyntax, args);
  if (!parsed.ok) return invalidSidebarLivePanelArgs(parsed.reason);
  return { ok: true, contract: { mode: "snapshot", density: "normal", frameCount: 1 } };
}

function invalidSidebarLivePanelArgs(value: string): SidebarLivePanelCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-sidebar-live-args",
      `- Reason: Unsupported /sidebar snapshot argument: ${value || "(empty)"}`,
      "- DoNext: Use /sidebar snapshot to capture the current state once.",
      "",
      syntaxHelp(sidebarSnapshotSyntax),
    ].join("\n"),
  };
}
