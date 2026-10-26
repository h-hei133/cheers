import { describe, expect, it } from "vitest";
import { contextMessageHash, contextSelectionIdentity, effectiveContextSelection, planContextSelection, selectModelContext } from "./selection.js";
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

  it("does not advance the selection revision when no message projection changes", () => {
    const plan = planContextSelection(session([{ id: "plain", role: "user" as const, content: "short" }]), "elide");
    expect(plan.changed).toBe(0);
    expect(plan.selection.revision).toBe(0);
  });

  it("ignores stale or non-effectual selection entries in prompt identity", () => {
    const source = { id: "tool-3", role: "tool" as const, content: "x".repeat(4096) };
    const plan = planContextSelection(session([source]), "elide");
    expect(effectiveContextSelection({ turns: [source], contextSelection: plan.selection })).toBeDefined();
    expect(contextSelectionIdentity({ turns: [source], contextSelection: plan.selection })).toBeDefined();
    const stale = { ...source, content: "changed" };
    expect(effectiveContextSelection({ turns: [stale], contextSelection: plan.selection })).toBeUndefined();
    expect(contextSelectionIdentity({ turns: [stale], contextSelection: plan.selection })).toBeUndefined();
    expect(contextSelectionIdentity({ turns: [{ id: "plain", role: "user" as const, content: "short" }],
      contextSelection: { version: 1, revision: 1, entries: [{ id: "plain", hash: contextMessageHash({ id: "plain", role: "user", content: "short" }), modes: ["elide"] }] } })).toBeUndefined();
  });
});
