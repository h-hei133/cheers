import { describe, expect, it } from "vitest";
import { buildSystemPrompt, systemPromptSnapshot, toChatMessages } from "./prompt.js";

describe("toChatMessages", () => {
  it("preserves source text while excluding an empty user message", () => {
    const content = "  keep 'a  b' in C:\\tmp\\file\n\t--literal\\  \n";
    expect(toChatMessages([
      { role: "user", content: " \t\n " },
      { role: "user", content },
    ])).toEqual([{ role: "user", content }]);
  });

  it("synthesizes cancelled tool messages when assistant tool calls were interrupted", () => {
    const converted = toChatMessages([
      { role: "user", content: "run it" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "bash", arguments: "{}" } }],
      },
      { role: "user", content: "never mind" },
    ]);
    expect(converted.map((message) => message.role)).toEqual(["user", "assistant", "tool", "user"]);
    expect(converted[2]).toMatchObject({ tool_call_id: "call_1", content: "(Operation cancelled or interrupted)" });
  });

  it("drops orphaned tool messages that have no preceding assistant tool call", () => {
    const converted = toChatMessages([
      { role: "tool", tool_call_id: "ghost", content: "??" },
      { role: "user", content: "hello" },
    ]);
    expect(converted).toEqual([{ role: "user", content: "hello" }]);
  });

  it("gives an assistant message with no calls a string body rather than null", () => {
    const converted = toChatMessages([{ role: "assistant", content: "" }]);
    expect(converted[0].content).toBe("");
  });

  it("closes calls left open at the end of the history", () => {
    const converted = toChatMessages([
      { role: "assistant", content: "", tool_calls: [{ id: "c", type: "function", function: { name: "read", arguments: "{}" } }] },
    ]);
    expect(converted.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c" });
  });
});

describe("buildSystemPrompt", () => {
  it('preserves assembly while accounting for raw source bytes and joining separators', () => {
    const context = { instructions: '项目规则🔒\n', appendedInstructions: '"extra"', skills: '<skills>读</skills>' };
    const snapshot = systemPromptSnapshot('build', context);
    expect(snapshot.text).toBe([buildSystemPrompt('build'), context.instructions, context.appendedInstructions, context.skills].join('\n'));
    expect(snapshot.sources.map(source => source.kind)).toEqual(['base', 'instructions', 'appended', 'skills', 'separators']);
    expect(snapshot.sources.reduce((sum, source) => sum + source.bytes, 0)).toBe(Buffer.byteLength(snapshot.text));
    expect(snapshot.sources.reduce((sum, source) => sum + source.codeUnits, 0)).toBe(snapshot.text.length);
    expect(JSON.stringify(snapshot.sources)).not.toContain('项目规则');
  });
  it("includes project instructions when they are supplied", () => {
    const prompt = buildSystemPrompt("build", {
      instructions: '<project_instructions path="/repo/AGENTS.md">\nrule one\n</project_instructions>',
    });

    expect(prompt).toContain("rule one");
    expect(prompt).toContain("/repo/AGENTS.md");
  });

  it("includes the skill list when it is supplied", () => {
    const prompt = buildSystemPrompt("build", {
      skills: "<available_skills>\n  <skill>\n    <name>pdf</name>\n  </skill>\n</available_skills>",
    });

    expect(prompt).toContain("pdf");
  });

  it("says nothing about instructions or skills when neither is supplied", () => {
    const prompt = buildSystemPrompt("build");

    expect(prompt).not.toContain("project_instructions");
    expect(prompt).not.toContain("available_skills");
  });

  it("keeps the execution rules ahead of project instructions", () => {
    // The rules describe how to work; project instructions describe this
    // repository. The general rules read first, the specific ones last.
    const prompt = buildSystemPrompt("build", {
      instructions: '<project_instructions path="/repo/AGENTS.md">\nrule one\n</project_instructions>',
    });

    expect(prompt.indexOf("CRITICAL EXECUTION & ANSWER RULES")).toBeLessThan(
      prompt.indexOf("rule one"),
    );
  });

  it("does not advertise tools when the model cannot call them", () => {
    const prompt = buildSystemPrompt('build', {
      toolNames: ['read', 'write'],
      instructions: '<project_instructions>rule one</project_instructions>',
    }, false);

    expect(prompt).toContain('No tools are available');
    expect(prompt).toContain('rule one');
    expect(prompt).not.toContain('equipped with real tools');
    expect(prompt).not.toContain('`read`');
    expect(prompt).not.toContain('`web_search`');
  });
});
