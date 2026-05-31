import { renderSidebarPanel } from "./sidebarPanelRenderer.js";
import { sidebarPanelTextHasForbiddenContent } from "./sidebarPanelModel.js";
import type { SidebarLivePanelFrame } from "./sidebarLivePanelRuntime.js";

export interface RenderSidebarLivePanelFrameOptions {
  readonly maxWidth?: number;
  readonly maxLines?: number;
}

export function renderSidebarLivePanelFrame(
  frame: SidebarLivePanelFrame,
  options: RenderSidebarLivePanelFrameOptions = {},
): string {
  const rendered = renderSidebarPanel(frame.panel, options);
  if (sidebarPanelTextHasForbiddenContent(rendered)) {
    throw new Error("Sidebar live panel render rejected forbidden content.");
  }
  return rendered;
}
