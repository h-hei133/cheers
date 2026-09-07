import { renderMarkdown, trimPartialFence } from "../transcript/markdown.js";
import type { ViewComponent } from "./contract.js";

export interface MarkdownOptions {
  readonly streaming?: boolean;
}

export class Markdown implements ViewComponent {
  private text = "";
  private streaming: boolean;
  private cached: { readonly text: string; readonly width: number; readonly lines: string[] } | undefined;

  constructor(text = "", options: MarkdownOptions = {}) {
    this.text = text;
    this.streaming = options.streaming ?? false;
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.cached = undefined;
  }

  setStreaming(streaming: boolean): void {
    if (streaming === this.streaming) return;
    this.streaming = streaming;
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
    const source = this.streaming ? trimPartialFence(this.text) : this.text;
    const lines = renderMarkdown(source, safe);
    const finalLines = lines.length > 0 ? [...lines] : [""];
    this.cached = { text: this.text, width: safe, lines: finalLines };
    return [...finalLines];
  }
}
