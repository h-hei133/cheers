import type {
  SidebarPanelBudget,
  SidebarPanelDensity,
} from "./sidebarPanelModel.js";

export interface SidebarLivePanelCommandContract {
  readonly mode: "watch";
  readonly density: SidebarPanelDensity;
  readonly frameCount: number;
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
    case "watch":
    case "live":
      return {
        ok: true,
        contract: {
          mode: "watch",
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
      `- Reason: Unsupported /sidebar live argument: ${value || "(empty)"}`,
      "- DoNext: Use /sidebar watch for the bounded live panel experiment.",
      "",
      "Supported /sidebar live forms:",
      "- /sidebar watch   bounded live/watch panel preview",
      "- /sidebar live    alias for /sidebar watch",
    ].join("\n"),
  };
}
