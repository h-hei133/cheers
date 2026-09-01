import { describe, expect, it } from "vitest";
import { matchSuggestions, SuggestionList, type Suggestion } from "./suggestions.js";
import { visibleWidth } from "../text/measure.js";

const commands: Suggestion[] = [
  { value: "/model", label: "/model", detail: "switch the active model" },
  { value: "/mcp", label: "/mcp", detail: "inspect MCP servers" },
  { value: "/memory", label: "/memory", detail: "manage project memory" },
  { value: "/cost", label: "/cost", detail: "token usage and cost" },
  { value: "/compact", label: "/compact", detail: "summarise the conversation" },
];

describe("ranking", () => {
  it("puts an exact match first", () => {
    expect(matchSuggestions("mcp", commands)[0]?.label).toBe("/mcp");
  });

  it("ranks prefix matches above subsequence matches", () => {
    const ranked = matchSuggestions("m", commands).map((item) => item.label);
    expect(ranked.slice(0, 3)).toEqual(["/mcp", "/model", "/memory"]);
  });

  it("still finds a subsequence match", () => {
    expect(matchSuggestions("mdl", commands).map((item) => item.label)).toContain("/model");
  });

  it("falls back to matching the description", () => {
    expect(matchSuggestions("summarise", commands).map((item) => item.label)).toEqual(["/compact"]);
  });

  it("returns everything for an empty query", () => {
    expect(matchSuggestions("", commands)).toHaveLength(commands.length);
  });

  it("returns nothing when there is no match at all", () => {
    expect(matchSuggestions("zzzz", commands)).toEqual([]);
  });
});

describe("selection", () => {
  it("wraps at both ends", () => {
    const list = new SuggestionList();
    list.setItems(commands);
    list.step(-1);
    expect(list.current()?.label).toBe("/compact");
    list.step(1);
    expect(list.current()?.label).toBe("/model");
  });

  it("keeps the selection in range when the candidate set shrinks", () => {
    const list = new SuggestionList();
    list.setItems(commands);
    list.step(-1);
    list.setItems(commands.slice(0, 2));
    expect(list.current()).toBeDefined();
  });

  it("renders nothing when empty", () => {
    expect(new SuggestionList().render(40)).toEqual([]);
  });

  it("marks the active row and stays within the width", () => {
    const list = new SuggestionList();
    list.setItems(commands);
    const rows = list.render(40);
    expect(rows[0]).toContain("❯");
    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(40);
  });

  it("reports how many candidates are hidden", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      value: `/c${index}`,
      label: `/c${index}`,
    }));
    const list = new SuggestionList();
    list.setItems(many);
    expect(list.render(40).at(-1)).toContain("4 more");
  });
});
