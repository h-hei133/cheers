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

    it('drops older tool images with source recovery guidance while retaining user and recent images', () => {
      const content = [{ type: 'text' as const, text: 'Read diagram.png, source hash abc.' },
        { type: 'image' as const, mimeType: 'image/png', data: 'x'.repeat(2000) }];
      const history = [
        { role: 'user' as const, content },
        { role: 'assistant' as const, content: 'read image' },
        { role: 'tool' as const, content, tool_call_id: 'old' },
        { role: 'user' as const, content: 'next' },
        { role: 'assistant' as const, content: 'read again' },
        { role: 'tool' as const, content, tool_call_id: 'recent' },
      ];
      const compacted = microcompactMessages(history, { keepRecentTurns: 1 });
      expect(compacted.messages[0].content).toBe(content);
      expect(compacted.messages[5].content).toBe(content);
      expect(compacted.messages[2].content).toContain('Read diagram.png, source hash abc.');
      expect(compacted.messages[2].content).toContain('re-read the source');
      expect(compacted.messages[2].content).not.toContain('x'.repeat(2000));
      expect(compacted.prunedCount).toBe(1);
      expect(compacted.savedChars).toBeGreaterThan(1800);
      expect(history[2].content).toBe(content);
    });

    it('does not infer duplicate images from matching descriptive text', () => {
      const image = (data: string) => [{ type: 'text' as const, text: 'same dimensions '.repeat(30) },
        { type: 'image' as const, mimeType: 'image/jpeg', data }];
      const history = [
        { role: 'tool' as const, content: image('a'.repeat(2000)) },
        { role: 'tool' as const, content: image('b'.repeat(2000)) },
        { role: 'user' as const, content: 'next' },
        { role: 'assistant' as const, content: 'answer' },
      ];
      const compacted = microcompactMessages(history, { keepRecentTurns: 1 });
      expect(compacted.prunedCount).toBe(2);
      expect(compacted.messages[1].content).not.toContain('Duplicate');
      expect(compacted.messages[1].content).toContain('same dimensions');
      expect(compacted.messages[1].content).toContain('re-read the source');
    });

    it('retains old text and duplicate results only when text pruning is explicitly disabled', () => {
      const content = 'first\n' + 'source line\n'.repeat(400) + 'last';
      const history = [
        { role: 'tool' as const, content, tool_call_id: 'one' },
        { role: 'tool' as const, content, tool_call_id: 'two' },
        { role: 'user' as const, content: 'continue' },
        { role: 'assistant' as const, content: 'working' },
      ];
      const ordinary = microcompactMessages(history, { keepRecentTurns: 1 });
      expect(ordinary.messages[0].content).toContain('[... Omitted');
      expect(ordinary.messages[1].content).toContain('Duplicate tool output');
      expect(microcompactMessages(history, { keepRecentTurns: 1, pruneToolText: true })).toEqual(ordinary);
      const retained = microcompactMessages(history, { keepRecentTurns: 1, pruneToolText: false });
      expect(retained).toEqual({ messages: history, prunedCount: 0, savedChars: 0 });
      expect(retained.messages[0]).toBe(history[0]);
      expect(microcompactMessages(ordinary.messages, { keepRecentTurns: 1, pruneToolText: false }).messages)
        .toEqual(ordinary.messages);
    });

    it('retains bounded mixed text while still removing only older tool images', () => {
      const text = 'Useful source Ω 😀\n'.repeat(150);
      const content = [{ type: 'text' as const, text },
        { type: 'image' as const, mimeType: 'image/png', data: 'a'.repeat(2000) },
        { type: 'text' as const, text: 'after image' },
        { type: 'image' as const, mimeType: 'image/png', data: 'b'.repeat(1800) }];
      const history = [
        { role: 'user' as const, content },
        { role: 'assistant' as const, content: 'read' },
        { role: 'tool' as const, content, tool_call_id: 'old' },
        { role: 'user' as const, content: 'continue' },
        { role: 'assistant' as const, content: 'read again' },
        { role: 'tool' as const, content, tool_call_id: 'recent' },
      ];
      const options = { keepRecentTurns: 1, pruneToolText: false };
      const retained = microcompactMessages(history, options);
      const old = retained.messages[2].content;
      expect(typeof old).toBe('string');
      expect(old).toContain(text);
      expect(old).toContain('after image');
      expect(old).toContain('Older tool images omitted; re-read the source');
      expect(old).not.toContain('a'.repeat(2000));
      expect(old).not.toContain('[... Omitted');
      expect(retained.messages[0].content).toBe(content);
      expect(retained.messages[5].content).toBe(content);
      expect(retained.prunedCount).toBe(1);
      expect(retained.savedChars).toBe(Math.max(0, text.length + 'after image'.length + 3800 - (old as string).length));
      expect(microcompactMessages(retained.messages, options)).toEqual({ messages: retained.messages, prunedCount: 0, savedChars: 0 });
      expect(microcompactMessages(history, { keepRecentTurns: 1, pruneToolText: true }))
        .toEqual(microcompactMessages(history, { keepRecentTurns: 1 }));
      expect(history[2].content).toBe(content);
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
