import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionStoreLayout, projectSessionFileLayout } from "../store/sessionFileLayout.js";
import { writeSessionMetadataRecord, writeSessionRecord } from "../store/sessionStore.js";
import { writeSessionState } from "../store/sessionStateStore.js";
import { appendSessionTurn, appendTranscriptEvent, parseTranscript } from "../transcript/sessionTranscript.js";
import { sessionUsageRecorder } from "../store/usage.js";
import { sessionRequestStore } from "../store/requests.js";
import { createRequestPolicy } from "../../core/agent/request/policy.js";
import { resetSessionUsage } from "../../observability/usageTelemetry.js";
import { gatherExport } from "./collect.js";
import { renderExportHtml } from "./html.js";
import type { Session } from "../schema/sessionRecord.js";

/**
 * A session gathered for export.
 *
 * The conversation and the tree live in different files — the transcript has no
 * parent pointers, and the tree has no message content — so the join is the part
 * worth testing. So is the scrubbing: an export is a file someone sends to
 * another person, and the failure mode is a credential leaving the machine.
 */

describe("gathering a session for export", () => {
  let home = "";
  let workspace = "";
  const sessionId = "sess_export_collect";
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  beforeEach(() => {
    const temporaryRoot = path.join(os.tmpdir(), "cheers-test");
    fs.mkdirSync(temporaryRoot, { recursive: true });
    home = fs.mkdtempSync(path.join(temporaryRoot, "export-home-"));
    workspace = fs.mkdtempSync(path.join(temporaryRoot, "export-work-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    resetSessionUsage(sessionId);
  });

  afterEach(() => {
    resetSessionUsage(sessionId);
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /** A session written the way the product writes one, so the tree exists. */
  function writeSession(turns: readonly { role: "user" | "assistant"; content: string }[]): Session {
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({ sessionsDir: storeLayout.sessionsDir, sessionId });
    const base: Session = {
      id: sessionId,
      projectRoot: workspace,
      createdAt: "2026-09-25T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:09.000Z",
      status: "active",
      turns: [],
    };
    writeSessionRecord({ session: base, layout });
    const recorded: Session = { ...base, turns: [] };
    let second = 1;
    for (const turn of turns) {
      const timestamp = `2026-09-25T00:00:0${second}.000Z`;
      second += 1;
      appendSessionTurn({
        session: recorded,
        message: { role: turn.role, content: turn.content },
        timestamp,
        append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
        writeMetadata: (session) => writeSessionMetadataRecord({ session, layout }),
        writeState: (session) => writeSessionState({ session, layout }),
      });
    }
    return recorded;
  }

  it("joins the tree to the messages by entry id", () => {
    // Neither file alone is enough: the transcript has no parents, the tree has
    // no content. The sidebar needs both, joined on the one field they share.
    writeSession([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);

    const result = gatherExport({ sessionId, workspace });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries).toHaveLength(2);
    expect(result.payload.tree.length).toBeGreaterThan(0);
    expect(result.payload.leafId).toBeTruthy();
  });

  it("exports a long chronological fallback without nested serialization limits", () => {
    writeSession([{ role: "user", content: "start" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const events = Array.from({ length: 4000 }, (_, index) => ({ type: "message", id: `entry-${index}`, role: "user", content: "short", timestamp: "2026-09-25T00:00:00.000Z" }));
    fs.writeFileSync(layout.transcriptPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    fs.writeFileSync(layout.statePath, "broken state");
    const gathered = gatherExport({ sessionId, workspace });
    expect(gathered.ok).toBe(true);
    if (!gathered.ok) return;
    expect(() => renderExportHtml(gathered.payload)).not.toThrow();
    expect(gathered.payload.warnings).toContain("Branch history is unavailable; showing transcript order.");
  });

  it("reports skipped malformed lines instead of claiming a complete conversation", () => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    fs.appendFileSync(layout.transcriptPath, "{malformed\n");
    const gathered = gatherExport({ sessionId, workspace });
    expect(gathered.ok).toBe(true);
    if (!gathered.ok) return;
    expect(gathered.payload.warnings).toContain("1 unreadable transcript line was omitted.");
  });

  it("reports unsupported and duplicate headers without losing readable messages", () => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: "session", id: sessionId, cwd: workspace, timestamp: "t", version: 999 }) + "\n");
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries).toHaveLength(1);
    expect(result.payload.warnings).toContain("An unexpected transcript header was found; file provenance is uncertain.");
    expect(result.payload.warnings).toContain("The transcript format version is unsupported; only recognized entries are shown.");
  });

  it("rejects duplicate message identities without changing the source", () => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const lines = fs.readFileSync(layout.transcriptPath, "utf8").trimEnd().split("\n");
    const message = lines.find(line => JSON.parse(line).type === "message")!;
    fs.appendFileSync(layout.transcriptPath, message + "\n");
    const before = fs.readFileSync(layout.transcriptPath);
    expect(gatherExport({ sessionId, workspace })).toEqual({ ok: false,
      reason: "The transcript has duplicate message identities; branch associations are ambiguous." });
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(before);
  });

  it("gives every tree node a preview so the sidebar reads without the body", () => {
    writeSession([
      { role: "user", content: "explain the health endpoint" },
      { role: "assistant", content: "It returns ok." },
    ]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const previews = JSON.stringify(result.payload.tree);
    expect(previews).toContain("explain the health endpoint");
  });

  it("removes a credential and keeps everything else", () => {
    // The two halves matter equally. A token must not survive the file, and the
    // conversation must — an export that scrubbed the answer would be useless,
    // which is why the report rules are not applied here.
    writeSession([
      { role: "user", content: "run: curl -H 'Authorization: Bearer sk-abcdefgh12345678' https://api.test" },
      { role: "assistant", content: "HTML follows:\n<html><body>hello</body></html>" },
    ]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const all = JSON.stringify(result.payload);
    expect(all).not.toContain("sk-abcdefgh12345678");
    // The report scrubber would have deleted this; an export must show it.
    expect(all).toContain("<html>");
  });

  it("refuses a session that does not exist rather than writing an empty file", () => {
    const result = gatherExport({ sessionId: "sess_absent", workspace });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("not found");
  });

  it('keeps every diff line containing an added code fence', () => {
    writeSession([{ role: 'user', content: 'start' }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const diff = ['@@ -1 +1,4 @@', '-old', '+```ts', '+const value = "中文";', '+```', '+TAIL_LINE'].join('\n');
    fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: 'message', id: 'diff', role: 'tool',
      timestamp: '2026-11-18T00:00:00Z', content: `Updated file\n\n\`\`\`diff\n${diff}\n\`\`\`` }) + '\n');
    const before = fs.readFileSync(layout.transcriptPath);
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries.at(-1)!.toolDiff).toBe(diff);
    expect(fs.readFileSync(layout.transcriptPath).equals(before)).toBe(true);
  });

  it('canonicalizes the existing JPEG alias without a transcript rewrite', () => {
    writeSession([{ role: 'user', content: 'start' }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const data = Buffer.from([255, 216, 255, 192, 0, 17, 8, 3, 0, 4, 0, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 217]).toString('base64');
    fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: 'message', id: 'alias', role: 'user',
      timestamp: '2026-11-18T00:00:00Z', content: [{ type: 'image', mimeType: 'image/jpg', data }] }) + '\n');
    const before = fs.readFileSync(layout.transcriptPath);
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries.at(-1)!.images).toEqual([{ mediaType: 'image/jpeg', data }]);
    expect(fs.readFileSync(layout.transcriptPath).equals(before)).toBe(true);
  });

  it('reports omitted damaged images without discarding valid historical attachments', () => {
    writeSession([{ role: 'user', content: 'start' }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: 'message', id: 'images', role: 'user',
      timestamp: '2026-11-18T00:00:00Z', content: [...Array.from({ length: 6 }, () => ({ type: 'image', mimeType: 'image/png', data })),
        { type: 'image', mimeType: 'image/png', data: '=' }, { type: 'image', mimeType: 'image/jpeg', data }] }) + '\n');
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries.at(-1)!.images).toHaveLength(6);
    expect(result.payload.warnings.join(' ')).toMatch(/2.*image.*omitted/i);
    // This directly appended fixture has no corresponding durable branch node.
    expect(result.payload.toolPairing).toBe('unavailable');
  });

  it('keeps complete branch pairing when only verified media is omitted', () => {
    const session = writeSession([{ role: 'user', content: 'start' }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    appendSessionTurn({ session, message: { role: 'user', content: [
      { type: 'image', mimeType: 'image/png', data }, { type: 'image', mimeType: 'image/png', data: '=' },
    ] }, timestamp: '2026-11-18T00:00:00Z',
    append: event => appendTranscriptEvent(layout.transcriptPath, event),
    writeMetadata: next => writeSessionMetadataRecord({ session: next, layout }),
    writeState: next => writeSessionState({ session: next, layout }),
    });
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.toolPairing).toBe('verified');
    expect(result.payload.entries.at(-1)!.images).toHaveLength(1);
    expect(result.payload.warnings).toHaveLength(1);
    expect(result.payload.warnings[0]).toMatch(/1 image was omitted/i);
  });

  it("scrubs structured credentials and metadata without merging entry identities", () => {
    writeSession([{ role: "user", content: "start" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const events = [
      { type: "message", id: "token=FAKE_ID_ONE", role: "assistant", timestamp: "token=FAKE_TIME", content: '{"password":"FAKE_JSON_SECRET","keep":"visible"}', origin: { model: "token=FAKE_MODEL", provider: "secret=FAKE_PROVIDER" }, tool_calls: [{ id: "token=FAKE_CALL", type: "function", function: { name: "token=FAKE_NAME", arguments: '{"api_key":"FAKE_ARGUMENT","path":"keep.txt"}' } }] },
      { type: "message", id: "token=FAKE_ID_TWO", role: "tool", timestamp: "t2", content: "result", tool_call_id: "token=FAKE_CALL" },
    ];
    fs.writeFileSync(layout.transcriptPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    fs.writeFileSync(layout.statePath, "{}");
    const result = gatherExport({ sessionId, workspace: "token=FAKE_WORKSPACE" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.payload)).not.toContain("FAKE_");
    expect(result.payload.entries[0]!.content).toContain('"keep":"visible"');
    expect(result.payload.entries[0]!.toolCalls![0]!.arguments).toContain('"path":"keep.txt"');
    expect(result.payload.entries[0]!.id).not.toBe(result.payload.entries[1]!.id);
    expect(result.payload.entries[0]!.toolCalls![0]!.id).toBe(result.payload.entries[1]!.toolCallId);
    expect(result.payload.tree[1]!.parentId).toBe(result.payload.tree[0]!.id);
  });

  it.each([{ entries: {} }, { entries: [null] }, { entries: [{ id: "x" }, { id: "x" }] }])("degrades an invalid branch snapshot: %j", thread => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    fs.writeFileSync(layout.statePath, JSON.stringify({ thread }));
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.warnings).toContain("Branch history is unavailable; showing transcript order.");
    expect(result.payload.entries[0]!.content).toBe("readable");
  });

  it("refuses a session with no conversation recorded", () => {
    // A file with no conversation in it, described as an export of one, is the
    // failure this replaces.
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({ sessionsDir: storeLayout.sessionsDir, sessionId });
    writeSessionRecord({
      session: {
        id: sessionId,
        projectRoot: workspace,
        createdAt: "2026-09-25T00:00:00.000Z",
        updatedAt: "2026-09-25T00:00:00.000Z",
        status: "active",
        turns: [],
      },
      layout,
    });

    const result = gatherExport({ sessionId, workspace });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("no conversation");
  });

  it("leaves result association to the selected path in the page", () => {
    writeSession([{ role: "user", content: "ask" }]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).not.toHaveProperty("results");
  });

  it("collects reasoning, safe images, tool diffs, usage, and aggregate stats while redacting secrets", () => {
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({ sessionsDir: storeLayout.sessionsDir, sessionId });
    const base: Session = {
      id: sessionId,
      projectRoot: workspace,
      createdAt: "2026-09-25T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:09.000Z",
      status: "active",
      turns: [],
    };
    writeSessionRecord({ session: base, layout });
    const recorded: Session = { ...base, turns: [] };
    const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    appendSessionTurn({
      session: recorded,
      message: {
        role: "user",
        content: [
          { type: "text", text: "inspect screenshot" },
          { type: "image", data: pngB64, mimeType: "image/png" },
          { type: "image", data: "PHN2Zz48L3N2Zz4=", mimeType: "image/svg+xml" },
        ],
      },
      timestamp: "2026-09-25T00:00:01.000Z",
      append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
      writeMetadata: (session) => writeSessionMetadataRecord({ session, layout }),
      writeState: (session) => writeSessionState({ session, layout }),
    });
    appendSessionTurn({
      session: recorded,
      message: {
        role: "assistant",
        content: "Editing file",
        origin: { provider: "openai", model: "gpt-5" },
        reasoning: { text: "check secret sk-1234567890abcdef12345678" },
        tool_calls: [{ id: "call-edit", type: "function", function: { name: "edit", arguments: "{}" } }],
      },
      timestamp: "2026-09-25T00:00:02.000Z",
      append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
      writeMetadata: (session) => writeSessionMetadataRecord({ session, layout }),
      writeState: (session) => writeSessionState({ session, layout }),
    });
    appendSessionTurn({
      session: recorded,
      message: {
        role: "tool",
        tool_call_id: "call-edit",
        content: "Updated a.ts\n\n```diff\n-old\n+new\n```",
        metadata: { isError: false },
      },
      timestamp: "2026-09-25T00:00:03.000Z",
      append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
      writeMetadata: (session) => writeSessionMetadataRecord({ session, layout }),
      writeState: (session) => writeSessionState({ session, layout }),
    });

    sessionUsageRecorder(sessionId)({ provider: "openai", model: "gpt-5", baseUrl: "https://provider.invalid",
      rates: { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 1 } })({
      prompt_tokens: 120, completion_tokens: 40, total_tokens: 160, prompt_tokens_details: { cached_tokens: 80 },
    });

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries[0]?.images).toEqual([{ mediaType: "image/png", data: pngB64 }]);
    expect(result.payload.entries[1]?.reasoning?.text).not.toContain("sk-1234567890abcdef12345678");
    expect(result.payload.entries[2]?.toolDiff).toBe("-old\n+new");
    expect(result.payload.stats).toMatchObject({
      userMessages: 1,
      assistantMessages: 1,
      toolResults: 1,
      toolCalls: 1,
      models: ["openai/gpt-5"],
      accounting: { scope: "session", status: "partial", usageStatus: "recorded", recordedRequests: 1,
        tokens: { input: 120, output: 40, cacheRead: 80, cacheWrite: 0, total: 160 },
        requestCoverage: { status: "unavailable" } },
    });
    expect(result.payload.stats?.accounting.estimatedCostUsd).toBeCloseTo(0.00044);
    expect(result.payload.entries.every(entry => !("usage" in entry))).toBe(true);
    const html = renderExportHtml(result.payload);
    expect(html).toContain("image-modal");
    expect(html).toContain("toggle-thinking");
  });

  it("exports durable billing beside an unknown dispatched request without adding ledger tokens again", () => {
    const session = writeSession([{ role: "user", content: "question" }, { role: "assistant", content: "answer" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const scope = { id: "workspace-scope", workspacePath: workspace, workspaceIdentity: "workspace-identity" };
    const store = sessionRequestStore({ getSessionDirPath: () => layout.sessionDir }, session, scope, () => ({}));
    const policy = createRequestPolicy(store, scope.id);
    const prepared = { requestId: "PRIVATE_REQUEST_ID", bodyDigest: "a".repeat(64), provider: "relay", model: "recorded",
      endpoint: "https://provider.invalid/PRIVATE_ENDPOINT", purpose: "answer", credentialId: "PRIVATE_CREDENTIAL_ID" };
    const complete = policy.reserve(prepared);
    complete.dispatch();
    complete.settle({ version: 1, inputTokens: 100, outputTokens: 30, cacheReadTokens: 60, complete: true });
    sessionUsageRecorder(sessionId)({ provider: "relay", model: "recorded", baseUrl: "https://provider.invalid",
      rates: { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 1 } })({
      prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, prompt_tokens_details: { cached_tokens: 60 },
    });
    const partial = policy.reserve({ ...prepared, requestId: "PRIVATE_PARTIAL_REQUEST_ID" });
    partial.dispatch();
    partial.settle({ version: 1, inputTokens: 12, complete: false });

    const before = fs.readFileSync(layout.statePath, "utf8");
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.stats?.accounting).toMatchObject({ scope: "session", status: "partial", usageStatus: "recorded",
      recordedRequests: 1, tokens: { input: 100, output: 30, cacheRead: 60, cacheWrite: 0, total: 130 },
      requestCoverage: { status: "partial", scopeCount: 1, pending: 1, dispatchedUnknown: 1, historyUnknown: true,
        knownPartialTokens: { input: 12 } } });
    expect(result.payload.stats?.accounting.estimatedCostUsd).toBeCloseTo(0.00036);
    expect(result.payload.stats?.accounting.requestCoverage.knownPartialTokens).not.toHaveProperty("output");
    expect(result.payload.entries.every(entry => !("usage" in entry))).toBe(true);
    expect(JSON.stringify(result.payload)).not.toContain("PRIVATE_");
    expect(fs.readFileSync(layout.statePath, "utf8")).toBe(before);
  });

  it.each(["absent", "metadata", "prompt-measurement"])("keeps %s accounting unavailable instead of fabricating output zero", kind => {
    writeSession([{ role: "user", content: "question" }, { role: "assistant", content: "answer" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const events = fs.readFileSync(layout.transcriptPath, "utf8").trimEnd().split("\n").map(line => JSON.parse(line));
    const assistant = events.find(event => event.type === "message" && event.role === "assistant");
    if (kind === "metadata") assistant.metadata = { usage: { inputTokens: 123, outputTokens: 456, costUsd: 7 } };
    if (kind === "prompt-measurement") assistant.promptMeasurement = {
      tokens: 123, messageCount: 1, identity: { provider: "fixture", model: "fixture" },
    };
    fs.writeFileSync(layout.transcriptPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.stats?.accounting).toEqual({ scope: "session", status: "unavailable", usageStatus: "unavailable",
      requestCoverage: { status: "unavailable" } });
    expect(result.payload.entries.every(entry => !("usage" in entry))).toBe(true);
  });

  it("does not read live accounting when exporting captured conversation bytes", () => {
    writeSession([{ role: "user", content: "captured conversation" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const captured = { transcript: parseTranscript(fs.readFileSync(layout.transcriptPath, "utf8")) };
    sessionUsageRecorder(sessionId)({ provider: "fixture", model: "fixture", baseUrl: "https://provider.invalid",
      rates: { promptPerMTok: 1, completionPerMTok: 2 } })({ prompt_tokens: 99, completion_tokens: 1 });
    expect(gatherExport({ sessionId, workspace })).toMatchObject({ ok: true,
      payload: { stats: { accounting: { tokens: { total: 100 } } } } });
    const result = gatherExport({ sessionId, workspace, captured });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.stats?.accounting).toEqual({ scope: "session", status: "unavailable", usageStatus: "unavailable",
      requestCoverage: { status: "unavailable" } });
  });

  it("retains recorded historical accounting after the workspace directory was removed", () => {
    writeSession([{ role: "user", content: "historical conversation" }]);
    sessionUsageRecorder(sessionId)({ provider: "fixture", model: "fixture", baseUrl: "https://provider.invalid" })({
      prompt_tokens: 10, completion_tokens: 2,
    });
    fs.rmSync(workspace, { recursive: true });
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.stats?.accounting.tokens?.total).toBe(12);
    expect(result.payload.stats?.accounting).not.toHaveProperty("estimatedCostUsd");
  });

  it.each(["missing", "corrupt", "different-root", "different-session"])("keeps accounting unavailable for %s state provenance", kind => {
    writeSession([{ role: "user", content: "readable conversation" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    sessionUsageRecorder(sessionId)({ provider: "fixture", model: "fixture", baseUrl: "https://provider.invalid" })({
      prompt_tokens: 10, completion_tokens: 2,
    });
    if (kind === "missing") fs.rmSync(layout.statePath);
    if (kind === "corrupt") fs.writeFileSync(layout.statePath, "broken");
    if (kind === "different-root") {
      const state = JSON.parse(fs.readFileSync(layout.statePath, "utf8"));
      fs.writeFileSync(layout.statePath, JSON.stringify({ ...state, projectRoot: home }));
    }
    if (kind === "different-session") {
      const metadata = JSON.parse(fs.readFileSync(layout.metadataPath, "utf8"));
      fs.writeFileSync(layout.metadataPath, JSON.stringify({ ...metadata, id: "sess_replacement" }));
    }
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries[0]?.content).toBe("readable conversation");
    expect(result.payload.stats?.accounting.usageStatus).toBe("unavailable");
    expect(result.payload.stats?.accounting).not.toHaveProperty("tokens");
  });
});
