import { describe, expect, it } from "vitest";
import { renderSidebarPanel } from "./sidebarPanelRenderer.js";
import {
  createSidebarPanel,
  createSidebarPanelSection,
} from "./sidebarPanelModel.js";
import { visibleWidth } from "../tui/text/measure.js";

/** A panel whose facts carry wide (double-cell) characters. */
function wideCharacterPanel() {
  return createSidebarPanel({
    title: "会话侧栏 sidebar",
    sections: [
      createSidebarPanelSection({
        id: "activity",
        title: "下一步 Next",
        lines: [
          { text: "目标目录 目标文件 目标目标目标目标目标目标目标目标目标目标目标", severity: "info" },
          { text: "plain ascii line for contrast", severity: "success" },
        ],
      }),
    ],
  });
}

describe("sidebar panel renderer width discipline", () => {
  it("keeps every row at one visible width, so wide characters do not break the frame", () => {
    const rows = renderSidebarPanel(wideCharacterPanel(), { maxWidth: 60 }).split("\n");

    // The top border sets the frame width; every row must match it in visible
    // cells. Counting code units instead — as the renderer once did — lets a
    // CJK line measure short and push its right border out of column.
    const frameWidth = visibleWidth(rows[0]!);
    expect(frameWidth).toBeGreaterThan(0);
    for (const row of rows) {
      expect(visibleWidth(row)).toBe(frameWidth);
    }
  });
});
