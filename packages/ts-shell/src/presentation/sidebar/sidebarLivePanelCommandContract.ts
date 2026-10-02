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
  if (args.length !== 1) {
    return invalidSidebarLivePanelArgs(args.join(" "));
  }
  const [mode] = args;
  switch (mode) {
    case "snapshot":
    case "watch":
    case "live":
      return {
        ok: true,
        contract: {
          mode: "snapshot",
          density: "normal",
          frameCount: 1,
        },
      };
    default:
      return invalidSidebarLivePanelArgs(mode ?? "");
  }
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
      "Supported /sidebar snapshot forms:",
      "- /sidebar snapshot  read-only snapshot; run again to refresh",
      "- /sidebar watch and /sidebar live are compatibility aliases for the same snapshot.",
    ].join("\n"),
  };
}
