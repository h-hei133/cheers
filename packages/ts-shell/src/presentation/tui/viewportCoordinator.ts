/**
 * Dual-Region Viewport Layout Coordinator
 *
 * Allocates terminal screen space cleanly between:
 * 1. Upper scrollable Transcript Region (Chat history, tool execution results, thinking pulse)
 * 2. Floating Slash Autocomplete Menu (when active)
 * 3. Pinned Bottom Region (Enclosed BoxComposer + embedded multi-segment status line + hints)
 */

export interface ViewportDimensions {
  readonly totalRows: number;
  readonly totalCols: number;
  readonly transcriptAvailableRows: number;
  readonly bottomRegionRows: number;
}

export class ViewportCoordinator {
  calculateDimensions(
    totalRows: number = process.stdout.rows || 24,
    totalCols: number = process.stdout.columns || 80,
    bottomBoxRowCount: number = 4,
    autocompleteRowCount: number = 0,
  ): ViewportDimensions {
    const safeRows = Math.max(10, totalRows);
    const safeCols = Math.max(20, totalCols);
    const bottomRegionRows = bottomBoxRowCount + autocompleteRowCount;
    const transcriptAvailableRows = Math.max(0, safeRows - bottomRegionRows);

    return {
      totalRows: safeRows,
      totalCols: safeCols,
      transcriptAvailableRows,
      bottomRegionRows,
    };
  }

  /**
   * Clamps transcript lines so they fit within the upper scrollable window without pushing
   * the composer box off-screen.
   */
  sliceVisibleTranscript(
    transcriptLines: readonly string[],
    availableRows: number,
  ): string[] {
    if (transcriptLines.length <= availableRows) {
      return [...transcriptLines];
    }
    // Keep most recent tail lines
    return transcriptLines.slice(-availableRows);
  }
}

export const viewportCoordinator = new ViewportCoordinator();
