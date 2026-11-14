import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeTraceDashboard, openTraceDashboard } from "../traceDashboard.js";
import { JsonlTraceStore } from "./jsonlStore.js";
import { renderTrace } from "./query.js";
import { InMemoryTraceStore, telemetryNow, type TelemetrySpan } from "./span.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await closeTraceDashboard();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("OTel Span, InMemoryTraceStore, and JsonlTraceStore", () => {
  it("keeps identities distinct between independent recorders and propagates the exact remote parent", async () => {
    const sender = new InMemoryTraceStore();
    const receiver = new InMemoryTraceStore();

    await sender.startSpan({ name: "sender.root" }, async (root) => {
      await receiver.extract(sender.inject(root)).startSpan({ name: "receiver.child" }, () => {});
    });
    await receiver.startSpan({ name: "receiver.root" }, () => {});

    const sent = sender.snapshot()[0]!;
    const received = receiver.snapshot();
    const child = received.find((span) => span.name === "receiver.child")!;
    const independent = received.find((span) => span.name === "receiver.root")!;
    expect(child.traceId).toBe(sent.traceId);
    expect(child.parentId).toBe(sent.id);
    expect(independent.traceId).not.toBe(sent.traceId);
    expect(new Set([sent.id, child.id, independent.id]).size).toBe(3);
    for (const span of [sent, child, independent]) {
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.id).toMatch(/^[0-9a-f]{16}$/);
      expect(span.traceId).not.toMatch(/^0+$/);
      expect(span.id).not.toMatch(/^0+$/);
    }
  });

  it("keeps root traces separate when a JSONL recorder is recreated and continues writing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-trace-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "traces.jsonl");
    const first = new JsonlTraceStore({ filePath });
    await first.startSpan({ name: "before.restart" }, () => {});

    const restarted = new JsonlTraceStore({ filePath });
    await restarted.startSpan({ name: "after.restart" }, () => {});

    const traces = (await restarted.findTraces()).traces;
    expect(traces).toHaveLength(2);
    expect(traces.map((trace) => trace.spans.map((span) => span.name))).toEqual(
      expect.arrayContaining([["before.restart"], ["after.restart"]]),
    );
    expect(new Set(traces.map((trace) => trace.traceId)).size).toBe(2);
    expect(new Set(traces.flatMap((trace) => trace.spans.map((span) => span.id))).size).toBe(2);
    for (const trace of traces) {
      expect((await restarted.getTrace(trace.traceId))?.spans).toHaveLength(1);
    }
  });

  it("records nested spans, enforces post-settlement inertness, and captures uncaught errors", async () => {
    const store = new InMemoryTraceStore();
    let leakedSpan: TelemetrySpan | undefined;

    await store.startSpan({ name: "turn", attributes: { model: "gpt-5" } }, async (root) => {
      leakedSpan = root;
      root.addEvent("prompt.ready", { tokens: 12 });
      const carrier = store.inject(root);
      expect(carrier).toBeDefined();
      const extracted = store.extract(carrier);

      await extracted.startSpan({ name: "provider.request" }, async (child) => {
        child.setAttributes({ attempt: 1 });
        child.setStatus({ status: "ok" });
      });
    });

    // Post-settlement mutations and children are inert no-ops.
    leakedSpan!.setAttributes({ mutatedAfterClose: true });
    leakedSpan!.addEvent("late.event");
    await leakedSpan!.startSpan({ name: "late.child" }, () => "ok");

    await expect(
      store.startSpan({ name: "failing.op" }, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const all = await store.findTraces();
    expect(all.traces).toHaveLength(2);
    expect(all.traces.some((t) => t.spans.some((s) => s.name === "late.child"))).toBe(false);

    const errPage = await store.findTraces({ errors: true });
    expect(errPage.traces).toHaveLength(1);
    expect(errPage.traces[0]!.spans[0]!.status).toEqual({
      status: "error",
      error: { name: "Error", message: "boom" },
    });

    const turnTrace = all.traces.find((t) => t.spans[0]!.name === "turn")!;
    expect(turnTrace.spans).toHaveLength(2);
    expect(turnTrace.spans[1]!.parentId).toBe(turnTrace.spans[0]!.id);
    expect(turnTrace.spans[0]!.attributes.mutatedAfterClose).toBeUndefined();
    expect(turnTrace.spans[0]!.events).toHaveLength(1);
  });

  it("supports keyset cursor pagination, bounded eviction, and control-character safe rendering", async () => {
    const store = new InMemoryTraceStore({ maxSpans: 10 });
    for (let i = 0; i < 12; i++) {
      await store.startSpan({ name: `op_${i}`, attributes: { idx: i } }, () => {});
    }
    expect(store.snapshot()).toHaveLength(10);

    const p1 = await store.findTraces({ limit: 4 });
    expect(p1.traces).toHaveLength(4);
    expect(p1.cursor).toBeDefined();

    const p2 = await store.findTraces({ limit: 4, cursor: p1.cursor });
    expect(p2.traces).toHaveLength(4);
    const ids1 = new Set(p1.traces.map((t) => t.traceId));
    for (const t of p2.traces) expect(ids1.has(t.traceId)).toBe(false);

    const rendered = renderTrace([
      {
        id: "span_1",
        traceId: "trace_1",
        name: "bad\nname\u001b[31m",
        startedMs: telemetryNow(),
        endedMs: telemetryNow() + 1,
        attributes: {},
        events: [],
        links: [],
        status: { status: "error", error: { name: "Error", message: "line1\r\nline2" } },
      },
    ]);
    expect(rendered).not.toContain("\nline2");
    expect(rendered).toContain("\\u001b");
  });

  it("persists redacted spans to JSONL and exposes them via openTraceDashboard", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-trace-"));
    tempDirs.push(dir);
    const traceFile = path.join(dir, "traces.jsonl");

    const writer = new JsonlTraceStore({ filePath: traceFile });
    await writer.startSpan(
      { name: "api.call", attributes: { authHeader: "Bearer super-secret-token-value-12345" } },
      async (span) => {
        span.setStatus({ status: "error", error: { name: "Error", message: "Bearer another-secret-token-99999" } });
      },
    );

    const raw = fs.readFileSync(traceFile, "utf8");
    expect(raw).not.toContain("super-secret-token-value-12345");
    expect(raw).not.toContain("another-secret-token-99999");

    const reader = new JsonlTraceStore({ filePath: traceFile });
    const found = await reader.findTraces({ name: "api.call" });
    expect(found.traces).toHaveLength(1);
    const trace = await reader.getTrace(found.traces[0]!.traceId);
    expect(trace?.spans[0]!.name).toBe("api.call");

    const dash = await openTraceDashboard(dir, path.join(dir, "missing.log"), reader);
    const res = await fetch(`${dash.url}data`);
    const payload = (await res.json()) as { rows: Array<{ component: string; message: string }> };
    const row = payload.rows.find((r) => r.component === "api.call");
    expect(row).toBeDefined();
    expect(row!.message).not.toContain("another-secret-token-99999");
  });
});
