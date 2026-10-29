import type { MouseReport } from '../../presentation/tui/input/mouse.js';
import type { InteractiveView } from '../../presentation/tui/surface/contract.js';
import type { Block } from '../../presentation/tui/transcript/blocks.js';
import type { SelectionPoint, SelectionSpan } from './selection.js';

interface ClickAnchor {
  readonly view: InteractiveView;
  readonly row: number;
  readonly column: number;
  readonly point: SelectionPoint;
  readonly painted: string | undefined;
  readonly block: Block;
  readonly snapshot: Readonly<Block>;
  readonly geometry: InteractiveView['pointerGeometry'];
  readonly top: number;
}

function sameBlock(snapshot: Readonly<Block>, block: Block): boolean {
  const keys = new Set([...Object.keys(snapshot), ...Object.keys(block)]);
  const liveThinking = block.kind === 'thinking' && block.collapsed === true && !block.finalized;
  return [...keys].every(key => key === 'text' || (key === 'elapsedMs' && liveThinking)
    || Object.is(snapshot[key as keyof Block], block[key as keyof Block]));
}

/** A block click has target/paint authority; a text selection has source authority. */
export class BlockClick {
  private anchor: ClickAnchor | undefined;

  press(view: InteractiveView, report: MouseReport, rows: readonly string[], span?: SelectionSpan): void {
    this.anchor = undefined;
    if (report.button !== 0 || report.shift || report.alt || report.ctrl || !span
      || span.from.row !== span.to.row || span.from.column !== span.to.column) return;
    const block = view.blockAtScreenRow(report.row);
    if (!block || block.collapsed === undefined) return;
    const point = view.screenToContent(report.row, report.column);
    this.anchor = { view, row: report.row, column: report.column, point, painted: rows[point.row], block,
      snapshot: { ...block }, geometry: view.pointerGeometry, top: view.selectionTop?.() ?? 0 };
  }

  cancel(): void { this.anchor = undefined; }

  release(view: InteractiveView, report: MouseReport, rows: readonly string[], sourceCurrent: boolean): Block | undefined {
    const anchor = this.anchor;
    this.anchor = undefined;
    if (!anchor || view !== anchor.view || report.button !== 0 || report.shift || report.alt || report.ctrl
      || report.row !== anchor.row || report.column !== anchor.column) return undefined;
    const block = view.blockAtScreenRow(report.row);
    if (block !== anchor.block || !sameBlock(anchor.snapshot, block)) return undefined;
    const point = view.screenToContent(report.row, report.column);
    if (point.row !== anchor.point.row || point.column !== anchor.point.column || rows[point.row] !== anchor.painted) return undefined;
    const geometry = view.pointerGeometry;
    if (anchor.top !== (view.selectionTop?.() ?? 0)) return undefined;
    if (anchor.geometry && (!geometry || geometry.width !== anchor.geometry.width
      || geometry.height !== anchor.geometry.height
      || geometry.layout !== anchor.geometry.layout)) return undefined;
    if (sourceCurrent && block.text === anchor.snapshot.text) return block;
    // A hidden live prefix can grow without changing its painted target. This
    // exception never admits a selected span, rewritten body or other block kind.
    return anchor.geometry && block.kind === 'thinking' && block.collapsed === true && !block.finalized
      && block.text.startsWith(anchor.snapshot.text) ? block : undefined;
  }
}
