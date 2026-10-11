import { describe, expect, it } from "vitest";
import { parseHistory, historyDigest, type HistoryDocument } from "./model.js";

const document: HistoryDocument = {
  kind: "session-history",
  version: 1,
  sourceId: "sess_source",
  title: "Saved conversation",
  leafId: "turn",
  nodes: [{ id: "root", kind: "session-root" }, { id: "turn", parentId: "root", kind: "turn-message" }],
  entries: [{ id: "turn", role: "user", content: "hello", timestamp: "2026-10-11T00:00:00.000Z" }],
};

describe("versioned history documents", () => {
  it("accepts a complete graph and produces a stable digest", () => {
    const parsed = parseHistory(JSON.stringify(document));
    expect(parsed).toEqual(document);
    expect(historyDigest(parsed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ["missing leaf", { ...document, leafId: "missing" }],
    ["duplicate node", { ...document, nodes: [...document.nodes, { id: "root", kind: "turn-message" as const }] }],
    ["unknown field", { ...document, extra: true }],
  ])("rejects %s before import", (_label, value) => {
    expect(() => parseHistory(JSON.stringify(value))).toThrow();
  });

  it('refuses unpaired, duplicated, and interrupted tool exchanges on every branch', () => {
    const make = (entries: HistoryDocument['entries']): HistoryDocument => ({ ...document,
      leafId: entries.at(-1)!.id,
      nodes: [{ id: 'root', kind: 'session-root' }, ...entries.map((entry, i) => ({ id: entry.id,
        parentId: i ? entries[i - 1]!.id : 'root', kind: 'turn-message' as const }))], entries });
    const time = '2026-10-11T00:00:00.000Z';
    const call = { id: 'call', role: 'assistant' as const, content: '', timestamp: time,
      toolCalls: [{ id: 'request', name: 'read', arguments: '{}' }] };
    const result = { id: 'result', role: 'tool' as const, content: 'saved result', timestamp: time, toolCallId: 'request' };
    expect(parseHistory(JSON.stringify(make([call, result])))).toMatchObject({ leafId: 'result' });
    for (const entries of [[result], [call], [call, result, { ...result, id: 'duplicate' }],
      [{ ...call, toolCalls: [...call.toolCalls, ...call.toolCalls] }, result],
      [call, { ...document.entries[0]!, id: 'new-user' }, result]]) {
      expect(() => parseHistory(JSON.stringify(make(entries)))).toThrow();
    }
    const branched = make([call, result]);
    expect(() => parseHistory(JSON.stringify({ ...branched, leafId: 'result', nodes: [...branched.nodes,
      { id: 'orphan-branch', parentId: 'root', kind: 'turn-message' }], entries: [...branched.entries, { ...result, id: 'orphan-branch' }] }))).toThrow();
  });
});
