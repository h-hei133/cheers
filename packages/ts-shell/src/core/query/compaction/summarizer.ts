export const EIGHT_SECTION_COMPACTION_PROMPT = `You are an expert software engineer and compaction engine. Condense the conversation history ABOVE into a structured, high-density checkpoint that allows another model to resume the work seamlessly without loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not verbose prose. Write "(none)" for an empty section.

<compacted-summary>
## Primary Request and Intent
- [the user's original goals and evolving requirements; quote exact wording where necessary]

## Key Technical Concepts
- [technologies, frameworks, architectural patterns, conventions, and rules in play]

## Files and Code
- [exact file paths: why they matter, key changes made or inspected, and notable signatures]

## Errors and Fixes
- [errors encountered, root cause diagnosis, and how they were resolved]

## Pending Jobs
- [explicitly requested tasks not yet completed]

## Current Work
- [precisely what is currently in progress at this checkpoint]

## Next Step
- [the single next action to take immediately, aligned with the latest request]

## Critical Context
- [architectural decisions, user preferences, constraints, open questions, and invariants]
</compacted-summary>

Rules:
- Write concise, factual technical prose.
- Preserve exact file paths, shell commands, function signatures, identifier names, and error strings.
- Capture user feedback and corrections faithfully.
- Output only the <compacted-summary>...</compacted-summary> block: do not call tools or execute code.
`;

export interface CheckpointSection {
  readonly title: string;
  readonly content: string;
}

/**
 * Parses a structured <compacted-summary> block into sections
 */
export function parseCompactedSummary(text: string): {
  readonly rawSummary: string;
  readonly isStructured: boolean;
} {
  const match = text.match(/<compacted-summary>([\s\S]*?)<\/compacted-summary>/i);
  if (match && match[1]) {
    return {
      rawSummary: match[1].trim(),
      isStructured: true,
    };
  }
  return {
    rawSummary: text.trim(),
    isStructured: false,
  };
}

/**
 * Formats a summarized checkpoint into a clean replacement context block
 */
export function formatCheckpointMessage(summary: string, footprintXml?: string): string {
  const parts = [
    "This is an established context checkpoint condensing earlier turns in this session to free up context space. Treat the background below as established ground truth and continue the task directly from the subsequent instructions.",
    "",
    `<compacted-summary>\n${summary}\n</compacted-summary>`,
  ];

  if (footprintXml && footprintXml.trim()) {
    parts.push("", footprintXml.trim());
  }

  return parts.join("\n");
}
