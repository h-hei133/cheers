/**
 * The instructions a project writes down for the agent, and which of them reach
 * the prompt.
 *
 * A repository's `AGENTS.md` is where its rules live, and until now nothing read
 * one. The file was only ever checked for existence. This module is the reader.
 *
 * Three decisions shape it, each taken from how a mature implementation behaves
 * rather than invented here:
 *
 *   1. Walk from the working directory up to the project root, not to the
 *      filesystem root. Stopping at the project root is what keeps an unrelated
 *      file in the user's home directory out of every project they open, and the
 *      marker used is the same `.git` check the file walk already relies on.
 *   2. One file per directory, chosen by priority. `AGENTS.override.md` first,
 *      so overriding a project's rules for a moment does not mean editing the
 *      tracked file.
 *   3. A byte budget spent across files. A budget that reset per file would
 *      bound nothing: ten files at the limit is ten times the limit in the
 *      prompt. Zero disables loading, which doubles as the opt-out.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { splitByteOrderMark } from "../../runtime/execution/fileText.js";
import { projectDirectories } from "../../core/project/directories.js";
import { expandImports } from "./importExpansion.js";
import { escapeAttribute, neutraliseTagBoundaries } from "../../core/text/safety.js";
import { userDataSearchDirsFor, userHomeDir } from "../../core/paths/userHome.js";
import { assertProfileStorage } from '../../core/paths/profile/context.js';

/**
 * Candidate file names, most specific first.
 *
 * The `.override` entry is a deliberate escape hatch: a project can be told
 * "these rules, for now" without editing the file it tracks. The two
 * upper-case variants cost an array slot each and cover repositories whose
 * tooling writes them.
 */
const CANDIDATES = [
  "AGENTS.override.md",
  "AGENTS.md",
  "AGENTS.MD",
  "CLAUDE.md",
  "CLAUDE.MD",
] as const;

/** How much instruction text may enter the prompt, across every file. */
export const DEFAULT_INSTRUCTION_BUDGET_BYTES = 32 * 1024;

/**
 * A file whose contents are appended to the prompt rather than treated as rules.
 *
 * Separate from the candidates above because it is read in addition to them, not
 * instead of them: a project may keep its rules in `AGENTS.md` and its extra
 * standing instructions in `APPEND_SYSTEM.md`, and both apply.
 *
 * There is deliberately no `SYSTEM.md`. That name means "replace the system
 * prompt", and the prompt carries the harness's own execution rules — a file able
 * to remove those is a different kind of trust decision than a file that adds to
 * them, and inventing a half-considered version of it here would be worse than
 * leaving the name unclaimed.
 */
const APPEND_CANDIDATES = ["APPEND_SYSTEM.md", "APPEND_SYSTEM.MD"] as const;



/** One instruction file that will be injected, in the order it is injected. */
export interface InstructionFile {
  /** Absolute path, used as the source label in the prompt. */
  readonly filePath: string
  readonly content: string
}

export interface InstructionLoadResult {
  readonly files: readonly InstructionFile[]
  /** Whether the budget cut something short, so the caller can say so. */
  readonly truncated: boolean
}

export interface InstructionLoadOptions {
  readonly cwd: string
  /** Where to look for the user-level file. Defaults to the real home directory. */
  readonly homeDir?: string
  /** Total bytes allowed across all files. Zero loads nothing. */
  readonly maxBytes?: number
  /** Selected, missing and higher-priority sources used by this read. */
  readonly onSource?: (target: string) => void
}

/**
 * The instruction files that apply to `cwd`, in injection order.
 *
 * Order is outermost first — the user's file, then the project root, then each
 * directory down to the working directory — so the most specific rules come last
 * and read as the ones that win.
 */
export function loadInstructionFiles(options: InstructionLoadOptions): InstructionLoadResult {
  const maxBytes = options.maxBytes ?? DEFAULT_INSTRUCTION_BUDGET_BYTES;
  if (maxBytes <= 0) {
    return { files: [], truncated: false };
  }

  const ordered: InstructionFile[] = [];

  const homeDir = options.homeDir ?? userHomeDir();
  // Every directory the user file may live in, current first. Reading only the
  // current one would drop the rules someone already wrote under an earlier name,
  // which is the same loss as deleting them.
  const userFile = userDataSearchDirsFor(homeDir)
    .map((directory) => loadOneFrom(directory, CANDIDATES, true, options.onSource))
    .find((file) => file !== undefined);
  if (userFile) ordered.push(userFile);

  ordered.push(...loadAncestorFiles(path.resolve(options.cwd), options.onSource));

  return spendBudget(ordered, maxBytes);
}

/**
 * The files from the project root down to `cwd`, outermost first.
 *
 * Walking stops at the first directory holding a project-root marker. When there
 * is none, only `cwd` itself is considered — an arbitrary parent directory is not
 * a project, and reading instructions out of one would attribute rules to a
 * repository that never declared them.
 */
function loadAncestorFiles(cwd: string, onSource?: (target: string) => void): InstructionFile[] {
  const files: InstructionFile[] = [];
  // The same chain skills are found along, so a repository cannot have its rules
  // honored from a directory while its skills are ignored from that directory.
  const directories = projectDirectories(cwd, onSource);
  // The outermost directory of the chain is the project boundary: a reference
  // may reach anywhere inside the project and nowhere outside it.
  const projectRoot = directories[0];
  for (const directory of directories) {
    const file = loadOneFrom(directory, CANDIDATES, false, onSource);
    if (!file) continue;
    files.push(
      projectRoot === undefined
        ? file
        : { ...file, content: expandImports(file.content, { baseDirectory: directory, projectRoot, onSource }).content },
    );
  }
  return files;
}

/**
 * The first candidate present in `directory` that is a readable file.
 *
 * A directory named `AGENTS.md` is skipped rather than accepted, and the search
 * continues: the user evidently meant something else by that name and may have
 * written one of the other candidates. An unreadable file is skipped for the
 * same reason — one bad file should not cost the reader every other one.
 */
function loadOneFrom(
  directory: string,
  candidates: readonly string[] = CANDIDATES,
  user = false,
  onSource?: (target: string) => void,
): InstructionFile | undefined {
  for (const candidate of candidates) {
    const filePath = path.join(directory, candidate);
    onSource?.(filePath);
    if (user) assertProfileStorage(filePath);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    // The mark is a transport artefact; leaving it in puts an invisible
    // character at the start of the prompt.
    return { filePath, content: splitByteOrderMark(raw).text };
  }
  return undefined;
}

/**
 * Trim the ordered files to the byte budget.
 *
 * A file that does not fit is cut at the byte boundary rather than dropped, so
 * the beginning of a long file — where its rules usually are — still arrives.
 * The cut is measured in bytes, not characters, because the budget is a byte
 * budget and a multi-byte character straddling the boundary would otherwise
 * push past it.
 *
 * The budget counts the files' own content. The `<project_instructions>` tags
 * and their paths add a fixed amount per file when the result is rendered, so the
 * prompt receives slightly more than the budget rather than exactly it. Counting
 * the framing here would mean this function had to know how the caller wraps what
 * it returns, and the overhead does not grow with the budget.
 */
function spendBudget(
  files: readonly InstructionFile[],
  maxBytes: number,
): InstructionLoadResult {
  const kept: InstructionFile[] = [];
  let remaining = maxBytes;

  for (const file of files) {
    if (remaining <= 0) return { files: kept, truncated: true };
    const size = Buffer.byteLength(file.content, "utf8");
    if (size <= remaining) {
      kept.push(file);
      remaining -= size;
      continue;
    }
    kept.push({ filePath: file.filePath, content: cutToBytes(file.content, remaining) });
    return { files: kept, truncated: true };
  }

  return { files: kept, truncated: false };
}

/** The longest prefix of `content` that fits in `maxBytes` of UTF-8. */
function cutToBytes(content: string, maxBytes: number): string {
  let used = 0;
  let end = 0;
  for (const character of content) {
    const width = Buffer.byteLength(character, "utf8");
    if (used + width > maxBytes) break;
    used += width;
    end += character.length;
  }
  return content.slice(0, end);
}

/**
 * The `APPEND_SYSTEM.md` files that apply to `cwd`, outermost first.
 *
 * Read in addition to the rule files rather than instead of them, and kept in a
 * separate list so the caller can label them differently: these are standing
 * instructions the harness did not write, and a reader should be able to tell
 * them apart from the rules the repository declares as its own.
 */
export function loadAppendedInstructionFiles(options: InstructionLoadOptions): InstructionLoadResult {
  const maxBytes = options.maxBytes ?? DEFAULT_INSTRUCTION_BUDGET_BYTES;
  if (maxBytes <= 0) {
    return { files: [], truncated: false };
  }

  const files: InstructionFile[] = [];
  for (const directory of projectDirectories(path.resolve(options.cwd), options.onSource)) {
    const file = loadOneFrom(directory, APPEND_CANDIDATES, false, options.onSource);
    if (file) files.push(file);
  }
  return spendBudget(files, maxBytes);
}

/**
 * Appended instructions as prompt text, or the empty string when there are none.
 *
 * Wrapped in their own tag so the model can tell an appended instruction from a
 * repository rule; the two arrive together but do not mean the same thing.
 */
export function renderAppendedInstructions(files: readonly InstructionFile[]): string {
  if (files.length === 0) return "";
  return files
    .map(
      (file) =>
        `<appended_instructions path="${escapeAttribute(file.filePath)}">\n${neutraliseTagBoundaries(file.content)}\n</appended_instructions>`,
    )
    .join("\n\n");
}

/**
 * The loaded files as prompt text, or the empty string when there are none.
 *
 * Each file is wrapped with its path so the model can tell which file a rule came
 * from, and so the boundary between two files' rules is visible rather than
 * implied by a blank line.
 */
export function renderInstructionFiles(files: readonly InstructionFile[]): string {
  if (files.length === 0) return "";
  return files
    .map(
      (file) =>
        `<project_instructions path="${escapeAttribute(file.filePath)}">\n${neutraliseTagBoundaries(file.content)}\n</project_instructions>`,
    )
    .join("\n\n");
}

/**
 * Stop wrapped text from closing the tag that wraps it.
 *
 * The content comes from a file a repository controls and it is injected between
 * tags this harness writes. Left alone, a `</project_instructions>` inside it ends
 * the block early, letting the rest appear outside the boundary — which is what
 * makes text look like it comes from somewhere other than the file it came from,
 * including from the harness itself.
 *
 * The angle brackets are escaped rather than the tag stripped: the reader should
 * still see that the file contained something shaped like a tag, which is itself
 * worth knowing, and silently deleting it would hide the attempt.
 */

