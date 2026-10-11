import { describe, expect, it } from "vitest";
import { contextMessageHash, planContextSelection, selectModelContext } from "./selection.js";
import type { Session } from "../schema/sessionRecord.js";

function session(turns: Session["turns"]): Pick<Session, "turns" | "contextSelection"> {
  return { turns };
}

describe("selective model context", () => {
  it("omits a large tool result in the model projection while retaining the source turn", () => {
    const source = { id: "tool-1", role: "tool" as const, content: "x".repeat(4096) };
    const plan = planContextSelection(session([source]), "elide");
    expect(plan.changed).toBe(1);
    expect(plan.estimatedTokens).toBeGreaterThan(0);
    expect(source.content).toHaveLength(4096);
    const projected = selectModelContext({ turns: [source], contextSelection: plan.selection });
    expect(projected[0]?.content).toContain("Tool result omitted from context");
    expect(projected[0]?.content).not.toBe(source.content);
  });

  it("protects signed reasoning and ignores a stale selection hash", () => {
    const signed = { id: "signed", role: "assistant" as const, content: "answer", reasoning: { text: "private", signature: "sig" } };
    const source = { id: "tool-2", role: "tool" as const, content: "x".repeat(4096) };
    const plan = planContextSelection(session([signed, source]), "elide");
    expect(plan.signed).toBe(1);
    expect(plan.selection.entries.some(entry => entry.id === "signed")).toBe(false);
    const stale = { ...source, content: "changed" };
    const projected = selectModelContext({ turns: [stale], contextSelection: plan.selection });
    expect(projected[0]?.content).toBe("changed");
    expect(contextMessageHash(stale)).not.toBe(plan.selection.entries[0]?.hash);
  });
});
