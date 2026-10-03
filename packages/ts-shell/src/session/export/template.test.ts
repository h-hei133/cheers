import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { PAGE_SCRIPT } from "./template.js";

class Element {
  children: Element[] = [];
  listeners = new Map<string, () => void>();
  className = "";
  id = "";
  style: Record<string, string> = {};
  parentNode?: Element;
  open = false;
  connected = false;
  layoutHeight?: number;
  classList = {
    add: (name: string) => { if (!this.className.split(" ").includes(name)) this.className += " " + name; },
    remove: (name: string) => { this.className = this.className.split(" ").filter(value => value !== name).join(" "); },
    toggle: (name: string) => {
      const present = this.className.split(" ").includes(name);
      if (present) this.classList.remove(name); else this.classList.add(name);
      return !present;
    },
  };
  get isConnected(): boolean { return this.connected || this.parentNode?.isConnected === true; }
  get scrollHeight(): number { return this.isConnected && this.parentNode?.open ? this.layoutHeight ?? this.textContent.split("\n").length * 20 : 0; }
  get clientHeight(): number { return this.className.split(" ").includes("collapsed") ? Math.min(144, this.scrollHeight) : this.scrollHeight; }
  get nextSibling(): Element | undefined { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1]; }
  innerHTML = "";
  private text = "";
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(""); }
  appendChild(child: Element) { this.children.push(child); child.parentNode = this; }
  insertBefore(child: Element, next?: Element) {
    const index = next ? this.children.indexOf(next) : this.children.length;
    this.children.splice(index, 0, child);
    child.parentNode = this;
  }
  addEventListener(name: string, action: () => void) { this.listeners.set(name, action); }
  setAttribute() {}
  scrollIntoView() {}
}

function runPage(payload: unknown) {
  const observed = new Set<Element>();
  let resized: ((entries: { target: Element }[]) => void) | undefined;
  const elements = new Map(["DATA", "tree", "conversation", "filter", "users-only", "toggle-sidebar"].map(id => [id, new Element()]));
  elements.get("conversation")!.connected = true;
  elements.get("DATA")!.textContent = Buffer.from(JSON.stringify(payload)).toString("base64");
  vm.runInNewContext(PAGE_SCRIPT, {
    document: { getElementById: (id: string) => elements.get(id), createElement: () => new Element(), body: new Element() },
    TextDecoder, Uint8Array, atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
    location: { hash: "" }, history: { replaceState() {} }, setTimeout() {},
    ResizeObserver: class {
      constructor(callback: typeof resized) { resized = callback; }
      observe(target: Element) { observed.add(target); }
      disconnect() { observed.clear(); }
    },
  });
  return Object.assign(elements, { resize: () => resized?.([...observed].map(target => ({ target }))) });
}

const call = (id: string) => ({ id, name: "read", arguments: "{}" });
const entry = (id: string, role = "assistant", extras: Record<string, unknown> = {}) => ({ id, role, content: id, html: id, ...extras });
const node = (id: string, parentId?: string) => ({ id, parentId, depth: 0, role: "assistant", kind: "turn-message", preview: id });

describe("exported page branch traversal", () => {
  it("adds a control when an open short result overflows after layout changes", () => {
    const elements = runPage({
      entries: [entry("a", "assistant", { toolCalls: [call("call_0")] }),
        entry("b", "tool", { toolCallId: "call_0", content: "wrapped text" })],
      tree: [node("a"), node("b", "a")], leafId: "b",
    });
    const details = elements.get("conversation")!.children[0]!.children.find(child => child.className === "call")!;
    details.open = true;
    details.listeners.get("toggle")!();
    expect(details.children.filter(child => child.className === "expand")).toHaveLength(0);
    const output = details.children.find(child => child.className.split(" ").includes("result"))!;
    output.layoutHeight = 600;
    elements.resize();
    expect(details.children.filter(child => child.className === "expand")).toHaveLength(1);
    expect(output.clientHeight).toBeLessThan(output.scrollHeight);
    elements.resize();
    expect(details.children.filter(child => child.className === "expand")).toHaveLength(1);
  });

  it.each([1, 30])("measures a mounted open result and preserves expansion across reopen (%s lines)", lines => {
    const elements = runPage({
      entries: [entry("a", "assistant", { toolCalls: [call("call_0")] }),
        entry("b", "tool", { toolCallId: "call_0", content: Array.from({ length: lines }, () => "result line").join("\n") })],
      tree: [node("a"), node("b", "a")], leafId: "b",
    });
    const details = elements.get("conversation")!.children[0]!.children.find(child => child.className === "call")!;
    expect(details.children.filter(child => child.className === "expand")).toHaveLength(0);
    details.open = true;
    details.listeners.get("toggle")?.();
    const output = details.children.find(child => child.className.split(" ").includes("result"))!;
    const buttons = details.children.filter(child => child.className === "expand");
    if (lines === 1) {
      expect(buttons).toHaveLength(0);
      expect(output.className).not.toContain("collapsed");
      return;
    }
    expect(buttons).toHaveLength(1);
    expect(output.clientHeight).toBeLessThan(output.scrollHeight);
    expect(buttons[0]!.textContent).toBe("Show more");
    buttons[0]!.listeners.get("click")!();
    expect(output.clientHeight).toBe(output.scrollHeight);
    expect(buttons[0]!.textContent).toBe("Show less");
    details.open = false;
    details.listeners.get("toggle")?.();
    details.open = true;
    details.listeners.get("toggle")?.();
    expect(details.children.filter(child => child.className === "expand")).toHaveLength(1);
    expect(output.className).not.toContain("collapsed");
    buttons[0]!.listeners.get("click")!();
    expect(buttons[0]!.textContent).toBe("Show more");
    expect(output.clientHeight).toBeLessThan(output.scrollHeight);
  });

  it("shows results only when their owning call and result are on the selected path", () => {
    const elements = runPage({
      entries: [entry("a", "assistant", { toolCalls: [call("call_0")] }), entry("off", "tool", { toolCallId: "call_0", content: "OTHER_BRANCH_RESULT" }), entry("selected")],
      tree: [node("a"), node("off", "a"), node("selected", "a")], leafId: "selected", results: { call_0: "OTHER_BRANCH_RESULT" },
    });
    expect(elements.get("conversation")!.textContent).not.toContain("OTHER_BRANCH_RESULT");
  });

  it("keeps repeated call IDs paired to their separate occurrences", () => {
    const elements = runPage({
      entries: [entry("a", "assistant", { toolCalls: [call("call_0")] }), entry("b", "tool", { toolCallId: "call_0", content: "FIRST_RESULT" }), entry("c", "assistant", { toolCalls: [call("call_0")] }), entry("d", "tool", { toolCallId: "call_0", content: "SECOND_RESULT" })],
      tree: [node("a"), node("b", "a"), node("c", "b"), node("d", "c")], leafId: "d", results: { call_0: "SECOND_RESULT" },
    });
    const turns = elements.get("conversation")!.children;
    expect(turns[0]!.textContent).toContain("FIRST_RESULT");
    expect(turns[0]!.textContent).not.toContain("SECOND_RESULT");
    expect(turns[2]!.textContent).toContain("SECOND_RESULT");
  });

  it("walks through nonmessage ancestors and stops on repeated graph nodes", () => {
    const payload = { entries: [entry("a"), entry("b")], tree: [node("a"), node("bridge", "a"), node("b", "bridge")], leafId: "b" };
    expect(runPage(payload).get("conversation")!.children).toHaveLength(2);
    payload.tree[0]!.parentId = "b";
    expect(runPage(payload).get("conversation")!.children).toHaveLength(2);
  });

  it("does not claim an inline owner for duplicate IDs in one call batch", () => {
    const elements = runPage({
      entries: [entry("a", "assistant", { toolCalls: [call("duplicate"), call("duplicate")] }), entry("b", "tool", { toolCallId: "duplicate", content: "AMBIGUOUS_RESULT" })],
      tree: [node("a"), node("b", "a")], leafId: "b",
    });
    expect(elements.get("conversation")!.children[0]!.textContent).not.toContain("AMBIGUOUS_RESULT");
    expect(elements.get("conversation")!.children).toHaveLength(2);
  });

  it("never pairs a result across a missing message or an unlocatable transcript gap", () => {
    const entries = [entry("a", "assistant", { toolCalls: [call("call_0")] }), entry("b", "tool", { toolCallId: "call_0", content: "NEW_CALL_RESULT" })];
    const missing = runPage({ entries, tree: [node("a"), node("missing", "a"), node("b", "missing")], leafId: "b" });
    expect(missing.get("conversation")!.children[0]!.textContent).not.toContain("NEW_CALL_RESULT");
    const unknown = runPage({ entries, tree: [node("a"), node("b", "a")], leafId: "b", warnings: ["1 unreadable transcript line was omitted."] });
    expect(unknown.get("conversation")!.children[0]!.textContent).not.toContain("NEW_CALL_RESULT");
    expect(unknown.get("conversation")!.children).toHaveLength(2);
  });
});
