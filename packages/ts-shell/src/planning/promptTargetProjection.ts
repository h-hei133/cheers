import path from "node:path";

export function normalizePromptPathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}

export function stripPathTokensForIntent(prompt: string): string {
  return prompt
    .replace(/["'`](?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^"'`]+["'`]/g, " ")
    .replace(
      /\b(?:[\w.-]+[\\/])+[\w.-]+\.(?:d\.ts|test\.(?:ts|tsx|jsx|js)|spec\.(?:ts|tsx|jsx|js)|[A-Za-z0-9]{1,8})\b/g,
      " ",
    )
    .replace(/(?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^\s\u3002\uFF0C,;:!?]+/g, " ")
    .replace(/\b[\w.-]+\.[A-Za-z0-9]{1,8}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasPathLikeReference(prompt: string): boolean {
  return /(?:[A-Za-z]:[\\/][^\s"'`<>|?*]+|\.{1,2}[\\/][^\s"'`<>|?*]+|\/[^\s"'`<>|?*]+|[A-Za-z0-9._-]+\.(?:d\.ts|test\.(?:ts|tsx|js|jsx)|spec\.(?:ts|tsx|js|jsx)|tsx|jsx|ts|js|py|go|rs|md|txt|json|log|yaml|yml|toml))(?:$|\s|[,.!?;:])/i.test(
    prompt,
  );
}

export function derivePromptPathTarget(
  prompt: string,
  workspaceRoot: string,
): {
  raw: string;
  cleaned: string;
  absolutePath: string;
  inWorkspace: boolean;
} | null {
  const quotedMatch = prompt.match(/["'`](\.{1,2}[\\/][^"'`]+?)["'`]/);
  const unquotedMatch = prompt.match(
    /(\.{1,2}[\\/][^\n\r]+?\.[A-Za-z0-9]+)(?=\s*(?:\u6587\u4ef6|\u5185\u5bb9|\u524d\s*\d+\s*\u884c|\u5728\u505a\u4ec0\u4e48|$|[\uFF0C,\u3002]))/u,
  );
  const raw = (quotedMatch?.[1] ?? unquotedMatch?.[1] ?? "").trim();
  if (!raw) {
    return null;
  }

  const cleaned = raw.replace(/[\uFF0C,\u3002.]+$/u, "").trim();
  const absolutePath = path.resolve(workspaceRoot, cleaned);
  const workspaceAbsolute = path.resolve(workspaceRoot);
  const normalizedAbsolute = absolutePath.toLowerCase();
  const normalizedWorkspace = workspaceAbsolute.toLowerCase();
  const inWorkspace =
    normalizedAbsolute === normalizedWorkspace ||
    normalizedAbsolute.startsWith(
      `${normalizedWorkspace}${path.sep.toLowerCase()}`,
    );

  return {
    raw: cleaned,
    cleaned,
    absolutePath,
    inWorkspace,
  };
}

export function hasExplicitExecutionIntent(
  rawPrompt: string,
  normalizedPrompt: string,
): boolean {
  const englishIntent = /\b(run|execute|command|bash|terminal)\b/i.test(
    normalizedPrompt,
  );
  const chineseIntent =
    /(?:\u8fd0\u884c|\u6267\u884c|\u547d\u4ee4|\u7ec8\u7aef)/u.test(rawPrompt);
  return englishIntent || chineseIntent;
}
