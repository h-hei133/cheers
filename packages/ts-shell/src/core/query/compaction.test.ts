import { describe, it, expect } from "vitest";
import {
  microcompactMessages,
  pruneToolContent,
} from "./microCompact.js";
import {
  parseCompactedSummary,
  formatCheckpointMessage,
  EIGHT_SECTION_COMPACTION_PROMPT,
} from "./compaction/summarizer.js";

describe("2-Layer Compaction Subsystem", () => {
  describe("Layer 1: Microcompact (Tool Result Pruner)", () => {
    it("prunes large tool content to head and tail with line/char count metadata", () => {
      const longOutput = "LINE_START\n" + "x".repeat(3000) + "\nLINE_END";
      const pruned = pruneToolContent(longOutput, 100, 100);

      expect(pruned).toContain("LINE_START");
      expect(pruned).toContain("LINE_END");
      expect(pruned).toContain("[... Omitted");
      expect(pruned.length).toBeLessThan(longOutput.length);
    });

    it("leaves recent turns intact while pruning tool outputs in older turns", () => {
      const history = [
        { role: "user" as const, content: "First task" },
        { role: "assistant" as const, content: "Running bash" },
        { role: "tool" as const, content: "HUGE_OLD_OUTPUT_".repeat(200) },
        { role: "assistant" as const, content: "Done first task" },
        { role: "user" as const, content: "Second task" },
        { role: "assistant" as const, content: "Doing second task" },
        { role: "user" as const, content: "Third task" },
        { role: "assistant" as const, content: "Doing third task" },
        { role: "tool" as const, content: "RECENT_OUTPUT_".repeat(200) },
      ];

      const { messages, prunedCount, savedChars } = microcompactMessages(history, {
        keepRecentTurns: 2,
        maxOutputChars: 500,
        headChars: 100,
        tailChars: 100,
      });

      expect(prunedCount).toBe(1);
      expect(savedChars).toBeGreaterThan(1000);
      expect(messages[2].content).toContain("[... Omitted");
      // The most recent tool message (index 8) is preserved untouched
      expect(messages[8].content).toBe(history[8].content);
    });
  });

  describe("Layer 2: 8-Section Checkpoint Summarizer", () => {
    it("contains all 8 required sections in the prompt template", () => {
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Primary Request and Intent");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Key Technical Concepts");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Files and Code");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Errors and Fixes");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Pending Jobs");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Current Work");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Next Step");
      expect(EIGHT_SECTION_COMPACTION_PROMPT).toContain("## Critical Context");
    });

    it("parses structured <compacted-summary> tags accurately", () => {
      const sampleLlmOutput = `
Here is the summary:
<compacted-summary>
## Primary Request and Intent
- Refactor auth module

## Next Step
- Run vitest
</compacted-summary>
      `;

      const parsed = parseCompactedSummary(sampleLlmOutput);
      expect(parsed.isStructured).toBe(true);
      expect(parsed.rawSummary).toContain("## Primary Request and Intent");
      expect(parsed.rawSummary).toContain("## Next Step");
    });

    it("formats replacement checkpoint message correctly", () => {
      const formatted = formatCheckpointMessage("## Next Step\n- Run build");
      expect(formatted).toContain("This is an established context checkpoint");
      expect(formatted).toContain("<compacted-summary>\n## Next Step\n- Run build\n</compacted-summary>");
    });
  });
});
