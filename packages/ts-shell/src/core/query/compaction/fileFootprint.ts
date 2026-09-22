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
