export interface ComposerChromeContext {
  readonly width: number;
  readonly paddingX?: number;
  readonly topTitle?: string;
  readonly statusText?: string;
}

export interface ComposerRowContext {
  readonly text: string;
  readonly width: number;
  readonly gutter?: string;
}

export interface ComposerStyle {
  readonly id: string;
  renderTop(ctx: ComposerChromeContext): string;
  renderRow(ctx: ComposerRowContext): string;
  renderBottom(ctx: ComposerChromeContext): string;
}
