export type RepoDiagnosisDisposition =
  | "grounded-explanation"
  | "needs-verification";

export type RepoDiagnosisEvidenceRole =
  | "config"
  | "entrypoint"
  | "implementation"
  | "test"
  | "docs"
  | "unknown";

export function parseGlobFileList(globOutput: string): string[] {
  return globOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function selectRepoExplainEvidenceTarget(input: {
  readonly prompt: string;
  readonly candidates: readonly { path: string; content: string }[];
}): { path: string; content: string } | undefined {
  if (input.candidates.length === 0) {
    return undefined;
  }
  if (input.candidates.length === 1) {
    return input.candidates[0];
  }

  const scored = input.candidates
    .map((candidate) => ({
      candidate,
      score: scoreRepoExplainEvidenceTarget(input.prompt, candidate),
    }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score <= 0 || (second && second.score === best.score)) {
    return undefined;
  }
  return best.candidate;
}

export function inferRepoDiagnosisDisposition(
  prompt: string,
): RepoDiagnosisDisposition {
  return /\b(?:fail|fails|failing|failed|error|errors|exception|boom|intermittently|flaky|crash|crashes)\b/i.test(
    prompt,
  )
    ? "needs-verification"
    : "grounded-explanation";
}

export function inferDiagnosisEvidenceRole(
  targetPath: string,
): RepoDiagnosisEvidenceRole {
  const lowered = targetPath.toLowerCase();
  if (/\b(?:test|spec)\./.test(lowered)) {
    return "test";
  }
  if (lowered.endsWith(".md")) {
    return "docs";
  }
  if (/(?:package\.json|tsconfig|config)/.test(lowered)) {
    return "config";
  }
  if (/(?:index|main|cli|entrypoint)\./.test(lowered)) {
    return "entrypoint";
  }
  if (/\.(?:ts|tsx|js|jsx|py|rs|go)$/.test(lowered)) {
    return "implementation";
  }
  return "unknown";
}

function scoreRepoExplainEvidenceTarget(
  prompt: string,
  candidate: { path: string; content: string },
): number {
  const tokens = extractRepoExplainSearchTokens(prompt);
  const searchable = `${candidate.path}\n${candidate.content}`.toLowerCase();
  return tokens.reduce(
    (score, token) => score + (searchable.includes(token) ? 1 : 0),
    0,
  );
}

function extractRepoExplainSearchTokens(prompt: string): string[] {
  const tokens = prompt
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
  const stopWords = new Set([
    "this",
    "that",
    "with",
    "from",
    "does",
    "repository",
    "repo",
    "intermittently",
    "explain",
  ]);
  return Array.from(new Set(tokens.filter((token) => !stopWords.has(token))));
}
