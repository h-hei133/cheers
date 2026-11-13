import { execFileSync } from "node:child_process";
import type { CellDimensions } from "../imageDimensions.js";

/**
 * CSI 16t cell pixel-size query/parser, OSC 133 shell-zone prefix handling,
 * and tmux OSC 8 hyperlink feature probing.
 */

/** Query terminal cell dimensions in pixels (`CSI 16 t`). */
export const CELL_SIZE_QUERY = "\x1b[16t";

const CELL_SIZE_REPLY = /^\x1b\[6;(\d+);(\d+)t$/;

/** Leading shell-integration semantic prompt zones (OSC 133 A/B/C) that corrupt column math if painted raw. */
export const OSC133_ZONE_PREFIX = /^(?:\x1b\]133;[ABC](?:\x07|\x1b\\))+/;
export const OSC133_PROMPT_START = /^\x1b\]133;A(?:\x07|\x1b\\)/;

/** Parse `CSI 6 ; heightPx ; widthPx t` into validated pixel dimensions. */
export function parseCellSizeResponse(sequence: string): CellDimensions | undefined {
  const match = CELL_SIZE_REPLY.exec(sequence);
  if (!match) return undefined;
  const heightPx = Number.parseInt(match[1]!, 10);
  const widthPx = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(heightPx) || !Number.isFinite(widthPx) || heightPx <= 0 || widthPx <= 0) {
    return undefined;
  }
  return { widthPx, heightPx };
}

/** Strip leading OSC 133 A/B/C zone markers while preserving prompt-start metadata when needed. */
export function stripOsc133ZonePrefix(line: string): string {
  return line.replace(OSC133_ZONE_PREFIX, "");
}

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  if (normalized === "1" || normalized === "true" || normalized === "on") return true;
  return undefined;
}

/**
 * Detect whether the current terminal (including inside tmux) supports OSC 8 hyperlinks.
 *
 * Inside tmux, queries `#{client_termfeatures}` synchronously with a 250ms cap
 * so `tmux` without `hyperlinks` falls back cleanly instead of emitting broken escapes.
 */
export function detectHyperlinkSupport(
  env: NodeJS.ProcessEnv = process.env,
  insideMultiplexer = env.TMUX !== undefined || (env.TERM ?? "").startsWith("tmux") || (env.TERM ?? "").startsWith("screen"),
): boolean {
  const override = readBooleanEnv(env.TSSHELL_TUI_HYPERLINKS ?? env.PI_HYPERLINKS);
  if (override !== undefined) return override;
  const term = (env.TERM ?? "").toLowerCase();
  if (!term || term === "dumb") return false;
  if (!insideMultiplexer) return true;
  if (!env.TMUX) return false;
  try {
    const features = execFileSync("tmux", ["display-message", "-p", "#{client_termfeatures}"], {
      encoding: "utf8",
      timeout: 250,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return features.split(",").some((feature) => feature.trim() === "hyperlinks");
  } catch {
    return false;
  }
}
