export interface FileFootprint {
  readonly readFiles: readonly string[];
  readonly modifiedFiles: readonly string[];
}

interface MessageLike {
  readonly role?: string;
  readonly tool_calls?: readonly unknown[];
}

interface ToolCallLike {
  readonly id?: string;
  readonly function?: {
    readonly name?: string;
    readonly arguments?: string | Record<string, unknown>;
  };
}

export function extractFileFootprint(messages: readonly unknown[]): FileFootprint {
  const readSet = new Set<string>();
  const modifiedSet = new Set<string>();

  for (const rawMsg of messages) {
    if (!rawMsg || typeof rawMsg !== "object") continue;
    const msg = rawMsg as MessageLike;
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const rawTc of msg.tool_calls) {
        if (!rawTc || typeof rawTc !== "object") continue;
        const tc = rawTc as ToolCallLike;
        if (!tc.function || typeof tc.function.name !== "string") continue;
        const name = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          if (typeof tc.function.arguments === "string") {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          } else if (tc.function.arguments && typeof tc.function.arguments === "object") {
            args = tc.function.arguments as Record<string, unknown>;
          }
        } catch {
          // Ignore malformed JSON arguments in footprint extraction
        }

        const filePath = typeof args.path === "string" ? args.path : typeof args.file === "string" ? args.file : undefined;
        if (!filePath) continue;

        if (name === "read" || name === "grep" || name === "glob") {
          readSet.add(filePath);
        } else if (name === "write" || name === "edit") {
          modifiedSet.add(filePath);
          // If modified, also remove from pure readSet to avoid duplicate noise
          readSet.delete(filePath);
        }
      }
    }
  }

  return {
    readFiles: Array.from(readSet).sort(),
    modifiedFiles: Array.from(modifiedSet).sort(),
  };
}

export function formatFileFootprintXml(footprint: FileFootprint): string {
  const parts: string[] = [];
  if (footprint.modifiedFiles.length > 0) {
    parts.push(
      `<modified-files>\n${footprint.modifiedFiles.map((f) => `- ${f}`).join("\n")}\n</modified-files>`,
    );
  }
  if (footprint.readFiles.length > 0) {
    parts.push(
      `<read-files>\n${footprint.readFiles.map((f) => `- ${f}`).join("\n")}\n</read-files>`,
    );
  }
  return parts.join("\n\n");
}

/**
 * The files a previous checkpoint recorded, read back from its own text.
 *
 * The footprint a compaction writes is already part of the checkpoint that
 * replaces the history, so it survives on its own — no extra field to store and
 * nothing to migrate for checkpoints written before this existed. What was
 * missing is reading it back: the next compaction looked only at the messages
 * in front of it and so forgot every file the earlier one had seen.
 *
 * Parsed rather than trusted: the text may have been written by an older
 * version, edited by hand, or truncated. Anything unrecognizable yields empty
 * lists, which loses nothing that was not already lost.
 */
export function parseFileFootprintXml(text: string | undefined): FileFootprint {
  if (!text) return { readFiles: [], modifiedFiles: [] };
  return {
    readFiles: extractListItems(text, "read-files"),
    modifiedFiles: extractListItems(text, "modified-files"),
  };
}

/**
 * What one compaction knows about files, given what the last one recorded.
 *
 * A file that was modified after being read counts as modified only: the model
 * needs to know the file changed, and listing it under both headings says the
 * same thing twice in a prompt that is already tight for room.
 *
 * Both lists are capped, keeping the most recent entries. A long session can
 * touch hundreds of files, and a checkpoint that names all of them spends the
 * context it was written to save.
 */
export function mergeFileFootprints(
  previous: FileFootprint,
  current: FileFootprint,
): FileFootprint {
  const modified = new Set<string>();
  const read = new Set<string>();
  // Earlier entries first, so a cap keeps the later ones.
  for (const path of [...previous.modifiedFiles, ...current.modifiedFiles]) {
    if (path.trim() !== "") modified.add(path);
  }
  for (const path of [...previous.readFiles, ...current.readFiles]) {
    if (path.trim() === "" || modified.has(path)) continue;
    read.add(path);
  }
  return {
    readFiles: capList([...read], MAX_FOOTPRINT_ENTRIES).sort(),
    modifiedFiles: capList([...modified], MAX_FOOTPRINT_ENTRIES).sort(),
  };
}

/** How many files one footprint may name, per list. */
const MAX_FOOTPRINT_ENTRIES = 200;

/** The last `limit` entries, so a cap drops the oldest rather than the newest. */
function capList(paths: readonly string[], limit: number): string[] {
  return paths.length <= limit ? [...paths] : paths.slice(paths.length - limit);
}

/** The `- ` items inside one tag, or nothing when the tag is absent. */
function extractListItems(text: string, tag: string): string[] {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
  if (!match || match[1] === undefined) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line !== "");
}
