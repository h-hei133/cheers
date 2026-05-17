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
  if (args.length === 0) {
    return {
      ok: true,
      contract: { mode: "preview", density: "normal" },
    };
  }
  if (args.length > 1) {
    return invalidSidebarPanelArgs(args.join(" "));
  }
  const [mode] = args;
  switch (mode) {
    case "panel":
      return {
        ok: true,
        contract: { mode: "panel", density: "normal" },
      };
    case "compact":
      return {
        ok: true,
        contract: { mode: "panel", density: "compact" },
      };
    case "detail":
      return {
        ok: true,
        contract: { mode: "panel", density: "detail" },
      };
    default:
      return invalidSidebarPanelArgs(mode ?? "");
  }
}

function invalidSidebarPanelArgs(value: string): SidebarPanelCommandParseResult {
  return {
    ok: false,
    errorOutput: [
      "Result",
      "- Outcome: blocked",
      "- BlockerKind: invalid-sidebar-args",
      `- Reason: Unsupported /sidebar argument: ${value || "(empty)"}`,
      "- DoNext: Use /sidebar, /sidebar panel, /sidebar compact, or /sidebar detail.",
      "",
      "Supported /sidebar forms:",
      "- /sidebar          read-only text preview",
      "- /sidebar panel    terminal-friendly panel preview",
      "- /sidebar compact  shortest panel view",
      "- /sidebar detail   expanded panel view",
    ].join("\n"),
  };
}
