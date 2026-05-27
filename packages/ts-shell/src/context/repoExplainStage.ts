export function buildInspectFilesDelivery(globOutput: string): string {
  const files = globOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (files.length === 0) {
    return "Task not completed: inspection ran but no candidate files were found for the requested scope.";
  }
  const preview = files.slice(0, 20).join("\n");
  return [
    "Repository inspection result (candidate files):",
    "```text",
    preview,
    "```",
    files.length > 20
      ? `Total matches: ${files.length}. Showing first 20 entries.`
      : `Total matches: ${files.length}.`,
  ].join("\n");
}

export function buildExplainTaskDelivery(
  targetPath: string,
  content: string,
): string {
  const lines = content.split(/\r?\n/);
  const nonEmpty = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preview = nonEmpty.slice(0, 5);
  const signalHints: string[] = [];

  if (/\b(import|from)\b/.test(content)) {
    signalHints.push("imports dependencies/modules");
  }
  if (/\b(function|const|class|export)\b/.test(content)) {
    signalHints.push("defines executable logic/API symbols");
  }
  if (/\b(test|describe|it\(|expect\()/i.test(content)) {
    signalHints.push("contains test-related logic");
  }
  if (/\b(fetch|http|api|request)\b/i.test(content)) {
    signalHints.push("contains request/network handling");
  }

  return [
    `Explanation for ${targetPath}:`,
    `- File appears to ${signalHints.length > 0 ? signalHints.join("; ") : "contain implementation/content logic based on inspected lines"}.`,
    `- Non-empty lines: ${nonEmpty.length}.`,
    preview.length > 0 ? "- Key excerpts:" : "- Key excerpts: none",
    preview.length > 0 ? ["```text", preview.join("\n"), "```"].join("\n") : "",
  ]
    .filter((item) => item.length > 0)
    .join("\n");
}

export function buildPurposeIoExplainDelivery(
  targetPath: string,
  content: string,
): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const inputHints = lines.filter((line) =>
    /\b(input|args?|params?|request|payload|stdin|argv)\b/i.test(line),
  );
  const outputHints = lines.filter((line) =>
    /\b(output|return|response|stdout|result)\b/i.test(line),
  );
  const roleHint = inferFileRoleHint(content);
  return [
    `Explanation for ${targetPath} (scoped to role + I/O):`,
    `- Role: ${roleHint}.`,
    `- Inputs: ${inputHints.length > 0 ? inputHints.slice(0, 2).join(" | ") : "No explicit input markers found in inspected lines."}`,
    `- Outputs: ${outputHints.length > 0 ? outputHints.slice(0, 2).join(" | ") : "No explicit output markers found in inspected lines."}`,
  ].join("\n");
}

function inferFileRoleHint(content: string): string {
  if (/\b(test|describe|it\(|expect\()/i.test(content)) {
    return "test verification logic";
  }
  if (/\b(fetch|request|api|http|endpoint)\b/i.test(content)) {
    return "request/adapter flow";
  }
  if (/\b(interface|type|schema|zod)\b/i.test(content)) {
    return "type/schema contract definition";
  }
  if (/\b(main|bootstrap|start|entry)\b/i.test(content)) {
    return "entry/bootstrap orchestration";
  }
  return "general implementation logic";
}
