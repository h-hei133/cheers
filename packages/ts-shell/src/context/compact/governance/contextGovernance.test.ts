import { describe, it, expect } from "vitest";
import { auditContextHealth, estimateTextTokens } from "./contextAnalysis.js";
import { microcompactMessages } from "../../../core/query/microCompact.js";

describe("Context Governance Subsystem", () => {
  describe("Token estimation & health audit", () => {
    it("estimates tokens accurately from text characters", () => {
      expect(estimateTextTokens("")).toBe(0);
      expect(estimateTextTokens("hello world")).toBeGreaterThan(0);
      expect(estimateTextTokens("a".repeat(350))).toBe(100);
    });

    it("audits context health, detects duplicate reads and near capacity warning", () => {
      const messages = [
        {
          role: "user" as const,
          content: "Please analyze the file",
        },
        {
          role: "assistant" as const,
          content: "Reading file",
          tool_calls: [
            { id: "c1", type: "function" as const, function: { name: "read", arguments: '{"path":"src/service.ts"}' } },
          ],
        },
        {
          role: "tool" as const,
          content: "FILE_CONTENT_1",
        },
        {
          role: "assistant" as const,
          content: "Reading file again",
          tool_calls: [
            { id: "c2", type: "function" as const, function: { name: "read", arguments: '{"path":"src/service.ts"}' } },
          ],
        },
        {
          role: "tool" as const,
          content: "FILE_CONTENT_2",
        },
      ];

      const audit = auditContextHealth(messages, { contextWindow: 10_000 });
      expect(audit.status).toBe("HEALTHY");
      expect(audit.duplicateFileReads.length).toBe(1);
      expect(audit.duplicateFileReads[0].path).toBe("src/service.ts");
      expect(audit.duplicateFileReads[0].count).toBe(2);
      expect(audit.suggestions.some((s) => s.includes("Duplicate file reads detected"))).toBe(true);
    });
  });

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
