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

/**
 * One kitty transmission: an initiator chunk carrying the controls, then any
 * number of continuation chunks (`m=1` … `m=0`) when the payload runs past 4 KiB.
 *
 * Anchored on both ends of every chunk so a row holding several images parses as
 * several transmissions, and so text between them cannot be swallowed. A
 * continuation is recognized by its controls rather than by being exactly `m=1`,
 * because the protocol allows a continuation to carry other keys too.
 *
 * Built per call rather than shared: a global pattern carries `lastIndex` as
 * mutable state, and both `matchAll` and `replace` read it. One shared instance
 * would make a parse depend on whether some earlier parse had finished.
 */
function kittyTransmissionPattern(): RegExp {
  return /\x1b_G([^;]*);[^\x1b]*\x1b\\(?:\x1b_G(?:[^;]*,)?m=1;[^\x1b]*\x1b\\)*(?:\x1b_G(?:[^;]*,)?m=0;[^\x1b]*\x1b\\)?/g;
}

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
    /** Id for a kitty image, so a redraw can place it without resending. */
    readonly imageId?: number;
  } = {},
): string {
  if (protocol === "kitty") {
    return encodeKitty(base64Data, options);
  }
  return encodeITerm2(base64Data, options);
}

/**
 * A placement-only sequence for a kitty image line already transmitted.
 *
 * A redraw of a frame rewrites rows that moved, and a row holding a full
 * transmission would resend the bytes every time the screen scrolled. Kitty's
 * own answer is the image id: transmit once with one, then re-place with
 * `a=p` — the terminal already holds the pixels. Returns nothing for a line
 * with no id (unidentifiable, so the caller must resend or drop) and nothing
 * for iTerm2, whose protocol has no placement mode at all.
 */
export function kittyPlacementFor(line: string): string | undefined {
  const match = /\x1b_G([^;]*);/.exec(line);
  if (!match) return undefined;
  // The placement keys are the geometry ones; payload and delete controls
  // belong to the transmission and must not ride along.
  const PLACEMENT = new Set(["i", "p", "x", "y", "w", "h", "X", "Y", "c", "r", "C", "U", "z", "P", "Q", "H", "V"]);
  const controls = match[1]!.split(",").filter((control) => PLACEMENT.has(control.split("=", 1)[0] ?? ""));
  if (!controls.some((control) => control.startsWith("i="))) return undefined;
  return `\x1b_Ga=p,q=2,${controls.join(",")}\x1b\\`;
}

/** One kitty transmission found in a rendered row. */
export interface KittyTransmission {
  readonly imageId: number;
  /** Bytes the transmission occupies, payload included. */
  readonly bytes: number;
}

/**
 * The kitty transmissions a row carries, with the bytes each one holds.
 *
 * A transmission is an initiator chunk carrying the controls plus any number of
 * continuation chunks; the run is one unit, so it is parsed as one. The byte
 * count is what an eviction budget accounts in: the payload size is the cost
 * the terminal paid to hold the image, and it is the only size this side can
 * know without decoding formats it deliberately does not decode.
 */
export function transmissionsIn(line: string): readonly KittyTransmission[] {
  const found: KittyTransmission[] = [];
  for (const match of line.matchAll(kittyTransmissionPattern())) {
    const id = /i=(\d+)/.exec(match[0])?.[1];
    if (id === undefined) continue;
    found.push({ imageId: Number(id), bytes: match[0].length });
  }
  return found;
}

/**
 * A deletion for one kitty image, so the terminal can free its pixels.
 *
 * An image stays in the terminal's memory until it is deleted or the emulator
 * exits, and nothing else in the protocol expires it: a session that pastes
 * screenshots for an afternoon would hold every one of them. `d=i` frees the
 * image and every placement of it, which is what an eviction needs.
 */
export function kittyDeleteImage(imageId: number): string {
  return `\x1b_Ga=d,d=i,i=${imageId},q=2\x1b\\`;
}

/** A deletion for every kitty image this session transmitted. */
export function kittyDeleteAllImages(): string {
  return "\x1b_Ga=d,d=A,q=2\x1b\\";
}

/**
 * A stable kitty image id derived from the image's own bytes.
 *
 * The transmit-once machinery needs the same image to carry the same id on
 * every frame: the first paint sends the payload under it, and a later paint
 * that finds the id already on screen places the image instead of resending.
 * A content hash gives that without threading identity through the render tree,
 * which rebuilds its blocks each frame. Kitty ids are positive 32-bit, and `0`
 * reads as "unset", so it is mapped away.
 *
 * The 32-bit width is the protocol's, not a choice made here: a random
 * allocator has the same collision probability and would additionally need
 * per-image state to stay stable across frames, which a stateless renderer
 * does not have.
 */
export function imageIdForData(base64Data: string): number {
  let hash = 2166136261;
  for (let index = 0; index < base64Data.length; index += 1) {
    hash ^= base64Data.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const id = hash >>> 0;
  return id === 0 ? 1 : id;
}

/**
 * Rewrite a row so images the screen already holds appear as placements.
 *
 * Both sides of a frame diff go through this: the rows that are on screen
 * now and the rows about to be. A transmitted image whose id is in
 * `transmitted` becomes its `a=p` form, so a moved row redraws as "place",
 * never as the payload again. Rows without images, and every iTerm2 row,
 * pass through untouched.
 */
export function swapTransmittedForPlacement(
  row: string,
  transmitted: ReadonlySet<number>,
): string {
  if (!row.includes("\x1b_G")) return row;
  // A kitty transmission is one initiator chunk carrying the controls followed
  // by any number of continuation chunks (`m=1` … `m=0`) when the payload runs
  // past 4 KiB. The whole run has to collapse to one placement: replacing chunk
  // by chunk would leave the continuation payloads behind, and a terminal that
  // reads a stray `m=1` continuation with no initiator draws nothing and faults
  // its graphics parser. So the match spans the initiator and every chunk that
  // follows it, and only the initiator's id decides whether the run is placed.
  return row.replace(kittyTransmissionPattern(), (sequence) => {
    const id = /\x1b_G(?:[^;]*,)?i=(\d+)/.exec(sequence)?.[1];
    if (id === undefined || !transmitted.has(Number(id))) return sequence;
    return kittyPlacementFor(sequence) ?? sequence;
  });
}

/** The window title, for a terminal that keeps one above the tab. */
export function windowTitle(title: string): string {
  // OSC 0 sets both window and tab titles, and BEL is the terminator every
  // emulator honours. A title with a control character would cut the
  // sequence short, so the text is taken to its printable form.
  return `\x1b]0;${title.replace(/[\x00-\x1f\x7f]/g, " ")}\x07`;
}

/** A desktop notification for the turn that finished while nobody watched. */
export function idleNotification(message: string): string {
  return `\x1b]777;notify;cheers;${message.replace(/[\x00-\x1f\x7f]/g, " ")}\x07`;
}

/** The terminal's own attention signal. */
export function bell(): string {
  return "\x07";
}

/** Kitty transmits in chunks: one control sequence per 4 KiB of payload. */
function encodeKitty(
  base64Data: string,
  options: { readonly columns?: number; readonly rows?: number; readonly imageId?: number },
): string {
  const CHUNK = 4096;
  const params = ["a=T", "f=100", "q=2"];
  if (options.columns !== undefined) params.push(`c=${options.columns}`);
  if (options.rows !== undefined) params.push(`r=${options.rows}`);
  if (options.imageId !== undefined) params.push(`i=${options.imageId}`);
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
