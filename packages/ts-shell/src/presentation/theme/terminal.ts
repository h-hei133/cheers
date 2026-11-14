import type { ThemeConfig } from '../themes/schema.js';
import type { ColorQueryOptions, RgbColor, TerminalColors } from '../tui/input/terminalColors.js';

const TOKEN_SLOTS: Readonly<Record<string, number>> = {
  error: 1, diffRemoved: 1, success: 2, filename: 2, command: 2, diffAdded: 2,
  accent: 3, mdHeading: 3, mdListBullet: 3, syntaxFunction: 3,
  border: 4, commandFlag: 4, mdLink: 4, syntaxKeyword: 4,
  commandNumber: 5, syntaxNumber: 5, commandPipe: 6, syntaxVariable: 6, syntaxBuiltin: 6,
  mdCodeBlock: 6, statusLinePath: 6, syntaxText: 7, mdCodeBorder: 7,
  borderMuted: 8, muted: 8, dim: 8, thinkingText: 8, toolOutput: 8, diffContext: 8,
  scrollbarTrack: 8, syntaxComment: 8, syntaxMeta: 8, mdLinkUrl: 8, mdQuoteText: 8,
  mdQuoteBorder: 8, mdRule: 8, statusLineContext: 8, commandString: 9, syntaxString: 9,
  statusLineGitClean: 10, warning: 11, statusLineGitDirty: 11, borderAccent: 12,
  mdCode: 13, statusLineModel: 13, syntaxType: 14, scrollbarThumb: 15,
};

function captureRgb(value: RgbColor | undefined): RgbColor | undefined {
  if (!value) return undefined;
  const { r, g, b } = value;
  if (![r, g, b].every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) return undefined;
  return Object.freeze({ r, g, b });
}

/** Own detached, bounded colors; absent palette slots remain unknown. */
export function mergeTerminalColors(previous: TerminalColors, reported: TerminalColors): TerminalColors {
  const foreground = captureRgb(reported.foreground) ?? previous.foreground;
  const background = captureRgb(reported.background) ?? previous.background;
  const palette = Array.from({ length: 16 }, (_, index) =>
    captureRgb(reported.palette?.[index]) ?? previous.palette?.[index]);
  return Object.freeze({ ...(foreground ? { foreground } : {}), ...(background ? { background } : {}),
    ...(palette.some(Boolean) ? { palette: Object.freeze(palette) } : {}) });
}

function sameRgb(left: RgbColor | undefined, right: RgbColor | undefined): boolean {
  return left === right || Boolean(left && right && left.r === right.r && left.g === right.g && left.b === right.b);
}

export function sameTerminalColors(left: TerminalColors, right: TerminalColors): boolean {
  return sameRgb(left.foreground, right.foreground) && sameRgb(left.background, right.background)
    && Array.from({ length: 16 }, (_, index) => index).every(index => sameRgb(left.palette?.[index], right.palette?.[index]));
}

function hex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function panel(background: RgbColor, foreground: RgbColor, amount: number): string {
  return hex({ r: Math.round(background.r + (foreground.r - background.r) * amount),
    g: Math.round(background.g + (foreground.g - background.g) * amount),
    b: Math.round(background.b + (foreground.b - background.b) * amount) });
}

/** Apply reported color families to the existing automatic theme and panel roles. */
export function projectTerminalTheme(base: ThemeConfig, terminal: TerminalColors): ThemeConfig {
  const colors = { ...base.colors };
  for (const [token, slot] of Object.entries(TOKEN_SLOTS)) {
    const color = terminal.palette?.[slot];
    if (color) colors[token] = hex(color);
  }
  const foreground = terminal.foreground ?? terminal.palette?.[7];
  const background = terminal.background ?? terminal.palette?.[0];
  if (foreground) {
    for (const token of ['text', 'userMessageText', 'toolTitle', 'commandArg', 'syntaxText']) colors[token] = hex(foreground);
  }
  if (background) {
    colors.statusBandBg = hex(background);
    const tint = terminal.palette?.[4] ?? foreground;
    if (tint) {
      colors.userMessageBg = panel(background, tint, 0.08);
      colors.selectedBg = panel(background, tint, 0.18);
    }
  }
  return { ...base, colors };
}

/** Bound initial discovery while retaining replies only for this captured host. */
export function requestTerminalPalette(
  device: { queryTerminalColors?(options?: ColorQueryOptions): Promise<TerminalColors> },
  apply: (colors: TerminalColors) => void,
): () => void {
  let active = true;
  let initialPending = true;
  let earlyLate: TerminalColors = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const retire = (): void => { active = false; if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const publish = (colors: TerminalColors): void => {
    if (!active) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    try { apply(colors); } catch { /* Optional terminal reports cannot interrupt the host. */ }
  };
  timer = setTimeout(() => publish({}), 100);
  timer.unref?.();
  try {
    const query = device.queryTerminalColors?.({ timeoutMs: 100, onLateReply: colors => {
      if (!active) return;
      if (initialPending) earlyLate = mergeTerminalColors(earlyLate, colors);
      publish(colors);
    }, onCancel: retire });
    if (query) void Promise.resolve(query).then(colors => {
      initialPending = false; publish(mergeTerminalColors(colors, earlyLate)); earlyLate = {};
    }, () => { initialPending = false; publish(earlyLate); earlyLate = {}; });
    else { initialPending = false; publish({}); }
  } catch { initialPending = false; publish({}); }
  return retire;
}
