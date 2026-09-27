import { describe, it, expect } from "vitest";
import { microcompactMessages } from "../../../core/query/microCompact.js";

describe("Context Governance Subsystem", () => {
  describe("Microcompact deduplication", () => {
    it("deduplicates identical repeated tool outputs in older turns", () => {
      const hugeOutput = "EXPORT_DATABASE_ROW_".repeat(50);
      const messages = [
        { role: "user" as const, content: "Query DB 1" },
        { role: "assistant" as const, content: "Running query" },
        { role: "tool" as const, content: hugeOutput },
        { role: "assistant" as const, content: "Results found" },
        { role: "user" as const, content: "Query DB 2" },
        { role: "assistant" as const, content: "Running same query" },
        { role: "tool" as const, content: hugeOutput },
        { role: "assistant" as const, content: "Done" },
        { role: "user" as const, content: "Final turn" },
        { role: "assistant" as const, content: "Latest answer" },
        { role: "user" as const, content: "Active turn" },
        { role: "assistant" as const, content: "Active answer" },
      ];

      const { messages: prepared, prunedCount, savedChars } = microcompactMessages(messages, {
        keepRecentTurns: 1,
        maxOutputChars: 500,
      });

      expect(prunedCount).toBeGreaterThan(0);
      expect(savedChars).toBeGreaterThan(0);
      expect(prepared.some((m) => m.content?.includes("Duplicate tool output omitted"))).toBe(true);
    });
  });
});
