import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Expanding `@path` references inside an instruction file.
 *
 * A project's rules often outgrow one file, and the usual way to split them is
 * to reference the other files from the main one. Without this, an instruction
 * file that says `@docs/style.md` tells the model about a file it was never
 * given, and the rules inside it are simply absent — a failure that looks like
 * the model ignoring an instruction rather than never having received it.
 *
 * Two decisions shape the scanner:
 *
 *   - It scans by hand rather than with a pattern, because it has to know where
 *     the code blocks are. An instruction file that documents this syntax — as
 *     this one's own tests do — would otherwise expand its own examples.
 *   - It resolves the path before deciding whether it is allowed. Checking the
 *     text first would let `@./link-to-outside.md` through, since the reference
 *     looks local and the file it names is not.
 */

/** How deep references may nest before expansion stops. */
const MAX_DEPTH = 5;

/** One expansion's outcome, so a caller can say what it skipped. */
export interface ImportExpansion {
  /** The content with every allowed reference replaced by what it named. */
  readonly content: string;
  /** References that were found but not followed, and why. */
  readonly skipped: readonly { readonly reference: string; readonly reason: string }[];
}

/**
 * Replace `@path` references in `content` with the referenced files' contents.
 *
 * `projectRoot` is the boundary: a reference resolving outside it is skipped,
 * because an instruction file able to pull in anything on the machine would let
 * a checked-in file read the user's home directory into the prompt. A reference
 * that fails — missing file, unreadable, too deep — is skipped rather than
 * failing the load, since the alternative is losing the instruction file that
 * referenced it.
 */
export function expandImports(
  content: string,
  options: {
    /** The directory references are resolved against. */
    readonly baseDirectory: string;
    /** The boundary a reference may not leave. */
    readonly projectRoot: string;
  },
): ImportExpansion {
  const skipped: { reference: string; reason: string }[] = [];
  const seen = new Set<string>([realPathOf(path.resolve(options.baseDirectory)) ?? ""]);
  const expanded = expand(content, options.baseDirectory, options.projectRoot, 0, seen, skipped);
  return { content: expanded, skipped };
}

function expand(
  content: string,
  baseDirectory: string,
  projectRoot: string,
  depth: number,
  seen: Set<string>,
  skipped: { reference: string; reason: string }[],
): string {
  if (depth >= MAX_DEPTH) return content;

  const codeRegions = codeBlockRegions(content);
  const pieces: string[] = [];
  let cursor = 0;

  for (const found of findReferences(content)) {
    // A reference inside a code block is an example, not an instruction.
    if (codeRegions.some(([start, end]) => found.start >= start && found.start < end)) continue;

    const resolved = path.resolve(baseDirectory, found.reference);
    const real = realPathOf(resolved);
    if (real === undefined) {
      skipped.push({ reference: found.reference, reason: "not found" });
      continue;
    }
    if (!isInside(projectRoot, real)) {
      skipped.push({ reference: found.reference, reason: "outside the project" });
      continue;
    }
    if (seen.has(real)) {
      skipped.push({ reference: found.reference, reason: "already included" });
      continue;
    }

    let nested: string;
    try {
      nested = fs.readFileSync(real, "utf8");
    } catch {
      skipped.push({ reference: found.reference, reason: "could not be read" });
      continue;
    }

    seen.add(real);
    pieces.push(content.slice(cursor, found.start));
    // Expanded against its own directory, so a referenced file's references are
    // relative to where it lives rather than to the file that referenced it.
    pieces.push(expand(nested, path.dirname(real), projectRoot, depth + 1, seen, skipped));
    cursor = found.end;
  }

  pieces.push(content.slice(cursor));
  return pieces.join("");
}

/** Where the fenced and inline code spans are, as half-open character ranges. */
function codeBlockRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const pattern = /(`+)([\s\S]*?)\1/g;
  for (;;) {
    const match = pattern.exec(content);
    if (!match) break;
    regions.push([match.index, match.index + match[0].length]);
  }
  return regions;
}

/**
 * Every `@path` reference, by position.
 *
 * The `@` has to start a word: `user@example.com` is an address, not a
 * reference. The path runs to the first whitespace, and must begin with `.`, `/`
 * or a letter, which is what separates a path from an annotation like `@todo`.
 */
function findReferences(content: string): Array<{ start: number; end: number; reference: string }> {
  const found: Array<{ start: number; end: number; reference: string }> = [];
  let cursor = 0;

  for (;;) {
    const at = content.indexOf("@", cursor);
    if (at === -1) return found;
    cursor = at + 1;

    // A reference starts a word. Anything else is part of a larger token.
    if (at > 0 && !isWhitespace(content[at - 1]!)) continue;

    let end = at + 1;
    while (end < content.length && !isWhitespace(content[end]!)) end += 1;

    const reference = content.slice(at + 1, end);
    const first = reference[0];
    if (!reference || (first !== "." && first !== "/" && !isLetter(first!))) continue;

    found.push({ start: at, end, reference });
  }
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * The real path of a file, or nothing when it does not resolve.
 *
 * Resolution happens on the filesystem rather than on the string so a symlink
 * pointing out of the project is seen for where it leads rather than for how it
 * is spelled.
 */
function realPathOf(candidate: string): string | undefined {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return undefined;
  }
}

/** Whether `candidate` is `root` itself or sits inside it. */
function isInside(root: string, candidate: string): boolean {
  const realRoot = realPathOf(root);
  if (realRoot === undefined) return false;
  if (candidate === realRoot) return true;
  return candidate.startsWith(realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep);
}
