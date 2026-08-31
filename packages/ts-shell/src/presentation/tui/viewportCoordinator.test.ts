import { describe, it, expect } from "vitest";
import { ViewportCoordinator } from "./viewportCoordinator.js";

describe("ViewportCoordinator Dual-Region Layout", () => {
  it("calculates height budgets accurately", () => {
    const coordinator = new ViewportCoordinator();
    const dims = coordinator.calculateDimensions(30, 100, 4, 3);

    expect(dims.totalRows).toBe(30);
    expect(dims.totalCols).toBe(100);
    expect(dims.bottomRegionRows).toBe(7); // 4 + 3
    expect(dims.transcriptAvailableRows).toBe(23); // 30 - 7
  });

  it("slices visible transcript lines cleanly to prevent viewport overflow", () => {
    const coordinator = new ViewportCoordinator();
    const history = Array.from({ length: 50 }, (_, i) => `History Line ${i + 1}`);

    const visible = coordinator.sliceVisibleTranscript(history, 10);
    expect(visible.length).toBe(10);
    expect(visible[0]).toBe("History Line 41");
    expect(visible[9]).toBe("History Line 50");
  });
});
