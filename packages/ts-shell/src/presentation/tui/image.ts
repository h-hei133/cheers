/** Image display over the two protocols terminals actually speak.
 *
 * A terminal either draws pictures inline or it does not, and the only way to
 * know is what the environment says: the emulators that implement a graphics
 * protocol set an identifying variable, and nothing else will. The detection
 * mirrors the capability flags this build already keeps — conservative, from
 * the environment, never from a device query that a piped consumer cannot
 * answer.
 *
 * Kitty graphics (`\x1b_G`) and iTerm2's OSC 1337 are the two protocols with
 * real adoption. Under tmux or screen neither survives the inner terminal's
 * redraw, so a multiplexed session reports no protocol and callers fall back
 * to text — an image that renders once and then corrupts on scrollback is
 * worse than a placeholder that never lies.
 */

export type ImageProtocol = "kitty" | "iterm2";

/** Which inline-image protocol the terminal speaks, or nothing. */
export function detectImageProtocol(env: NodeJS.ProcessEnv = process.env): ImageProtocol | undefined {
  const term = (env.TERM ?? "").toLowerCase();
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  // A multiplexer redraws its own screen and strips graphics it did not emit;
  // pi reaches the same verdict and we keep it.
  if (env.TMUX !== undefined || term.startsWith("tmux") || term.startsWith("screen")) {
    return undefined;
  }
  if (env.KITTY_WINDOW_ID !== undefined || env.KITTY_PID !== undefined || program === "kitty") {
    return "kitty";
  }
  // ghostty, WezTerm and Warp all implement the Kitty graphics protocol.
  if (
    program === "ghostty" ||
    term.includes("ghostty") ||
    env.GHOSTTY_RESOURCES_DIR !== undefined ||
    env.WEZTERM_PANE !== undefined ||
    program === "wezterm" ||
    program === "warpterminal" ||
    env.WARP_TERMINAL_SESSION_UUID !== undefined
  ) {
    return "kitty";
  }
  if (env.ITERM_SESSION_ID !== undefined || program === "iterm.app") {
    return "iterm2";
  }
  return undefined;
}

/** One inline-image sequence for the protocol, or nothing when there is none.
 *
 * The data arrives as the base64 the multimodal content already carries, so
 * nothing here re-encodes. Sizing is in terminal cells: the caller knows how
 * wide its view is and the protocol scales to fit, which keeps a screenshot
 * from overwriting the composer row.
 */
export function inlineImageSequence(
  protocol: ImageProtocol,
  base64Data: string,
  options: {
    readonly columns?: number;
    readonly rows?: number;
    readonly name?: string;
  } = {},
): string {
  if (protocol === "kitty") {
    return encodeKitty(base64Data, options);
  }
  return encodeITerm2(base64Data, options);
}

/** Kitty transmits in chunks: one control sequence per 4 KiB of payload. */
function encodeKitty(
  base64Data: string,
  options: { readonly columns?: number; readonly rows?: number },
): string {
  const CHUNK = 4096;
  const params = ["a=T", "f=100", "q=2"];
  if (options.columns !== undefined) params.push(`c=${options.columns}`);
  if (options.rows !== undefined) params.push(`r=${options.rows}`);
  if (base64Data.length <= CHUNK) {
    return `\x1b_G${params.join(",")};${base64Data}\x1b\\`;
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < base64Data.length; offset += CHUNK) {
    const chunk = base64Data.slice(offset, offset + CHUNK);
    const isLast = offset + CHUNK >= base64Data.length;
    if (offset === 0) {
      chunks.push(`\x1b_G${params.join(",")},m=1;${chunk}\x1b\\`);
    } else if (isLast) {
      chunks.push(`\x1b_Gm=0;${chunk}\x1b\\`);
    } else {
      chunks.push(`\x1b_Gm=1;${chunk}\x1b\\`);
    }
  }
  return chunks.join("");
}

/** iTerm2's inline file sequence, with the size the decoder needs. */
function encodeITerm2(
  base64Data: string,
  options: { readonly columns?: number; readonly rows?: number; readonly name?: string },
): string {
  const params = [
    "inline=1",
    `size=${Buffer.byteLength(base64Data, "base64")}`,
  ];
  if (options.columns !== undefined) params.push(`width=${options.columns}`);
  if (options.rows !== undefined) params.push(`height=${options.rows}`);
  if (options.name !== undefined) {
    params.push(`name=${Buffer.from(options.name).toString("base64")}`);
  }
  return `\x1b]1337;File=${params.join(";")}:${base64Data}\x07`;
}
