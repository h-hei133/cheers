export interface FileUnchangedAssertion {
  readonly path: string;
}

export interface FileConstraintAssertions {
  readonly unchangedAssertions: FileUnchangedAssertion[];
  readonly protectedMutationPaths: string[];
  readonly allowedMutationPaths: string[];
}

export function extractFileConstraintAssertions(
  prompt: string,
): FileConstraintAssertions {
  const unchangedAssertions = extractLowRiskUnchangedVerifications(prompt);
  return {
    unchangedAssertions,
    protectedMutationPaths: extractProtectedMutationPaths(
      prompt,
      unchangedAssertions,
    ),
    allowedMutationPaths: extractAllowedMutationPaths(prompt),
  };
}

export function extractLowRiskUnchangedVerifications(
  prompt: string,
): FileUnchangedAssertion[] {
  const assertions: FileUnchangedAssertion[] = [];
  const matches = prompt.matchAll(
    /([\w./\\-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))\s+\b(?:is|stays?|remains?)\s+unchanged\b/gi,
  );
  for (const match of matches) {
    const path = match[1]?.trim();
    if (path) {
      assertions.push({ path: path.replace(/\\/g, "/") });
    }
  }
  return uniqueStable(assertions.map((assertion) => assertion.path)).map(
    (path) => ({ path }),
  );
}

function extractAllowedMutationPaths(prompt: string): string[] {
  const paths: string[] = [];
  const matches = prompt.matchAll(
    /\bonly\s+(?:modify|change|edit|touch)\s+([\w./\\-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))/gi,
  );
  for (const match of matches) {
    const path = match[1]?.trim();
    if (path) {
      paths.push(path.replace(/\\/g, "/"));
    }
  }
  return uniqueStable(paths);
}

function extractProtectedMutationPaths(
  prompt: string,
  unchangedAssertions: ReadonlyArray<{ path: string }>,
): string[] {
  const paths = unchangedAssertions.map((assertion) => assertion.path);
  const matches = prompt.matchAll(
    /\b(?:do\s+not|don't)\s+(?:modify|change|edit|touch)\s+([\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))/gi,
  );
  for (const match of matches) {
    const path = match[1]?.trim();
    if (path) {
      paths.push(path.replace(/\\/g, "/"));
    }
  }
  return uniqueStable(paths);
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizePathLike(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}
