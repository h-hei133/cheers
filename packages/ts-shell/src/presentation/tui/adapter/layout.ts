import { padToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { Container, type ViewComponent } from "./contract.js";

export interface TextOptions {
  readonly paddingX?: number;
  readonly paddingY?: number;
  readonly background?: (text: string) => string;
}

export class Text implements ViewComponent {
  private text = "";
  private readonly paddingX: number;
  private readonly paddingY: number;
  private readonly background: ((text: string) => string) | undefined;
  private cached: { readonly text: string; readonly width: number; readonly lines: string[] } | undefined;

  constructor(text = "", options: TextOptions = {}) {
    this.text = text;
    this.paddingX = Math.max(0, Math.floor(options.paddingX ?? 1));
    this.paddingY = Math.max(0, Math.floor(options.paddingY ?? 0));
    this.background = options.background;
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.cached = undefined;
  }

  invalidate(): void {
    this.cached = undefined;
  }

  render(width: number): string[] {
    const safe = Math.max(1, Math.floor(width));
    if (this.cached && this.cached.text === this.text && this.cached.width === safe) {
      return [...this.cached.lines];
    }
    if (!this.text || this.text.trim() === "") {
      const lines = [""];
      this.cached = { text: this.text, width: safe, lines };
      return [""];
    }
    const paddingX = Math.min(this.paddingX, Math.max(0, Math.floor((safe - 1) / 2)));
    const contentWidth = Math.max(1, safe - paddingX * 2);
    const left = " ".repeat(paddingX);
    const right = " ".repeat(paddingX);
    const lines: string[] = [];
    for (const raw of this.text.replace(/\t/g, "   ").split("\n")) {
      const wrapped = wrapPlain(raw, contentWidth);
      for (const row of wrapped) {
        const padded = padToWidth(`${left}${row}${right}`, safe);
        lines.push(this.background ? this.background(padded) : padded);
      }
    }
    const empty = this.background ? this.background(" ".repeat(safe)) : " ".repeat(safe);
    const result = [...Array<string>(this.paddingY).fill(empty), ...lines, ...Array<string>(this.paddingY).fill(empty)];
    const finalLines = result.length > 0 ? result : [""];
    this.cached = { text: this.text, width: safe, lines: finalLines };
    return [...finalLines];
  }
}

function wrapPlain(line: string, cells: number): string[] {
  if (cells <= 0) return [""];
  if (visibleWidth(line) <= cells) return [line];
  const words = line.split(/(\s+)/);
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current + word;
    if (visibleWidth(candidate) <= cells || current === "") {
      current = candidate;
      continue;
    }
    rows.push(current);
    current = word.trimStart();
  }
  rows.push(current);
  return rows.length > 0 ? rows : [""];
}

export interface StackOptions {
  readonly gap?: number;
}

function normalizeGap(gap: number | undefined): number {
  return gap === undefined || !Number.isFinite(gap) ? 0 : Math.max(0, Math.floor(gap));
}

export class VStack extends Container {
  private readonly gap: number;

  constructor(children: ViewComponent[] = [], options: StackOptions = {}) {
    super();
    this.gap = normalizeGap(options.gap);
    for (const child of children) this.addChild(child);
  }

  override render(width: number): string[] {
    const lines: string[] = [];
    this.children.forEach((child, index) => {
      if (index > 0) {
        for (let i = 0; i < this.gap; i++) lines.push("");
      }
      for (const line of child.render(width)) lines.push(line);
    });
    return lines;
  }
}

export class HStack extends Container {
  private readonly gap: number;

  constructor(children: ViewComponent[] = [], options: StackOptions = {}) {
    super();
    this.gap = normalizeGap(options.gap);
    for (const child of children) this.addChild(child);
  }

  override render(width: number): string[] {
    if (this.children.length === 0) return [];
    const safe = Math.max(1, Math.floor(width));
    const count = this.children.length;
    const gaps = this.gap * (count - 1);
    const each = Math.max(1, Math.floor((safe - gaps) / count));
    const rendered = this.children.map((child) => child.render(each));
    const height = Math.max(...rendered.map((rows) => rows.length));
    const lines: string[] = [];
    for (let row = 0; row < height; row++) {
      const cells: string[] = [];
      rendered.forEach((rows, index) => {
        if (index > 0) cells.push(" ".repeat(this.gap));
        cells.push(padToWidth(rows[row] ?? "", each));
      });
      lines.push(padToWidth(cells.join(""), safe));
    }
    return lines;
  }
}
