import { syntaxHelp } from "../../core/commands/syntax/projection.js";
import { sidebarPanelSyntax, sidebarSyntax } from "./syntax.js";
import { parseSyntax } from "../../core/commands/syntax/parse.js";
import type {
  SidebarPanelBudget,
  SidebarPanelDensity,
} from "./sidebarPanelModel.js";

export type SidebarPanelCommandMode = "preview" | "panel";

export interface SidebarPanelCommandContract {
  readonly mode: SidebarPanelCommandMode;
  readonly density: SidebarPanelDensity;
  readonly budget?: Partial<SidebarPanelBudget>;
}

export interface SidebarPanelCommandParseResult {
  readonly ok: boolean;
  readonly contract?: SidebarPanelCommandContract;
  readonly errorOutput?: string;
}

export function parseSidebarPanelCommandArgs(
  args: readonly string[],
): SidebarPanelCommandParseResult {
  const parsed = parseSyntax(sidebarPanelSyntax, args);
  if (!parsed.ok) return invalidSidebarPanelArgs(parsed.reason);
  const action = parsed.action.name;
  return { ok: true, contract: { mode: action === "" ? "preview" : "panel", density: action === "compact" || action === "detail" ? action : "normal" } };
}

function invalidSidebarPanelArgs(value: string): SidebarPanelCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-sidebar-args",
      `- Reason: Unsupported /sidebar argument: ${value || "(empty)"}`,
      "- DoNext: Use /sidebar, /sidebar panel, /sidebar compact, /sidebar detail, or /sidebar snapshot.",
      "",
      syntaxHelp(sidebarSyntax),
    ].join("\n"),
  };
}
