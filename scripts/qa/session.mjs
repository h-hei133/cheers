import fs from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

const SAVED_LINK_MARKDOWN = "qa-link-label [safe](https://example.com/qa-link)";
const SAVED_MATH_INLINE = "$x^2 + y_1$";
const SAVED_MATH_UNKNOWN = "$\\unknown{x}+\\alpha$";
const SAVED_MATH_MATRIX = [
  "\\begin{bmatrix}",
  "1&20\\\\300&4",
  "\\end{bmatrix}",
].join("\n");
export const SAVED_ASSISTANT_MARKDOWN = [
  SAVED_LINK_MARKDOWN,
  "",
  SAVED_MATH_INLINE,
  "",
  SAVED_MATH_UNKNOWN,
  "",
  SAVED_MATH_MATRIX,
].join("\n");
export const SAVED_DIFF_OLD = "qa-old-side-source";
export const SAVED_DIFF_NEW = "qa-new-side-source";

const SAVED_DIFF_CALL = "qa-diff-call";
const SAVED_DIFF_OUTPUT = [
  "artifact: qa-diff.txt",
  "```diff",
  "--- a/qa-diff.txt",
  "+++ b/qa-diff.txt",
  "@@ -1 +1 @@",
  `-${SAVED_DIFF_OLD}`,
  `+${SAVED_DIFF_NEW}`,
  "```",
].join("\n");

export function seedRecoverySession(home, project) {
  const sessionId = `sess_recovery_probe_${Date.now()}`;
  const sessionDir = path.join(home, ".cheers", "sessions", sessionId);
  const timestamp = new Date().toISOString();
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "metadata.json"), JSON.stringify({
    id: sessionId,
    projectRoot: project,
    title: "Recovery probe",
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  fs.writeFileSync(path.join(sessionDir, "state.json"), JSON.stringify({
    status: "interrupted",
    projectRoot: project,
    pendingPrompt: "Recover the interrupted probe",
    runPhase: "idle",
    interruptedKind: "prompt",
    pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
    thread: {
      schemaVersion: 1,
      entries: [
        { id: `${sessionId}:root`, kind: "session-root", order: 0, timestamp },
        { id: "turn_recovery_probe", parentId: `${sessionId}:root`, kind: "turn-message", role: "user", order: 1, timestamp },
      ],
      activeLeafId: "turn_recovery_probe",
      branches: [],
      compactions: [],
    },
  }));
  fs.writeFileSync(path.join(sessionDir, "transcript.jsonl"), [
    JSON.stringify({ type: "session", version: 1, id: sessionId, timestamp, cwd: project }),
    JSON.stringify({ type: "message", id: "turn_recovery_probe", role: "user", content: "Recover the interrupted probe", timestamp }),
    JSON.stringify({ type: "lifecycle", id: "evt_recovery_probe", event: "run-interrupted", timestamp, detail: "Recover the interrupted probe" }),
  ].join("\n") + "\n");
  return sessionId;
}

export function seedSavedSession(home, project) {
  const sessionId = `sess_saved_probe_${Date.now()}`;
  const sessionDir = path.join(home, ".cheers", "sessions", sessionId);
  const timestamp = new Date().toISOString();
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "metadata.json"), JSON.stringify({
    id: sessionId,
    projectRoot: project,
    title: "Saved probe",
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  fs.writeFileSync(path.join(sessionDir, "state.json"), JSON.stringify({
    status: "active",
    projectRoot: project,
    runPhase: "idle",
    pendingLifecycle: { pendingApprovals: {}, pendingTools: {}, taskStates: {} },
    thread: {
      schemaVersion: 1,
      entries: [
        { id: `${sessionId}:root`, kind: "session-root", order: 0, timestamp },
        { id: "turn_saved_probe", parentId: `${sessionId}:root`, kind: "turn-message", role: "user", order: 1, timestamp },
        {
          id: "turn_saved_probe_math",
          parentId: "turn_saved_probe",
          kind: "turn-message",
          role: "assistant",
          order: 2,
          timestamp,
        },
        {
          id: "turn_saved_probe_diff_call",
          parentId: "turn_saved_probe_math",
          kind: "turn-message",
          role: "assistant",
          order: 3,
          timestamp,
          toolCalls: [{
            id: SAVED_DIFF_CALL,
            type: "function",
            function: { name: "edit", arguments: JSON.stringify({ path: "qa-diff.txt" }) },
          }],
        },
        {
          id: "turn_saved_probe_diff_result",
          parentId: "turn_saved_probe_diff_call",
          kind: "turn-message",
          role: "tool",
          order: 4,
          timestamp,
          toolCallId: SAVED_DIFF_CALL,
        },
      ],
      activeLeafId: "turn_saved_probe_diff_result",
      branches: [],
      compactions: [],
    },
  }));
  fs.writeFileSync(path.join(sessionDir, "transcript.jsonl"), [
    JSON.stringify({ type: "session", version: 1, id: sessionId, timestamp, cwd: project }),
    JSON.stringify({ type: "message", id: "turn_saved_probe", role: "user", content: "Saved probe", timestamp }),
    JSON.stringify({ type: "message", id: "turn_saved_probe_math", role: "assistant", content: SAVED_ASSISTANT_MARKDOWN, timestamp }),
    JSON.stringify({
      type: "message",
      id: "turn_saved_probe_diff_call",
      role: "assistant",
      content: "",
      timestamp,
      tool_calls: [{
        id: SAVED_DIFF_CALL,
        type: "function",
        function: { name: "edit", arguments: JSON.stringify({ path: "qa-diff.txt" }) },
      }],
    }),
    JSON.stringify({
      type: "message",
      id: "turn_saved_probe_diff_result",
      role: "tool",
      content: SAVED_DIFF_OUTPUT,
      timestamp,
      tool_call_id: SAVED_DIFF_CALL,
    }),
  ].join("\n") + "\n");
  return sessionId;
}

export function extractSessionId(output, exclude) {
  return [...stripVTControlCharacters(output).matchAll(/sess_[A-Za-z0-9_]+/g)]
    .map(match => match[0])
    .find(id => id !== exclude);
}

export function currentSessionFromStore(home, project) {
  try {
    const store = JSON.parse(fs.readFileSync(path.join(home, ".cheers", "current-session.json"), "utf8"));
    return store.byProjectRoot?.[project]?.sessionId
      ?? Object.values(store.byProjectRoot ?? {}).map(value => value?.sessionId).find(Boolean);
  } catch {
    return undefined;
  }
}

export function assertTranscript(home, sessionId, expected, qaOutputDir) {
  const file = path.join(home, ".cheers", "sessions", sessionId, "transcript.jsonl");
  if (!fs.existsSync(file)) throw new Error(`session transcript missing for ${sessionId}`);
  const transcript = fs.readFileSync(file, "utf8");
  if (qaOutputDir) {
    fs.mkdirSync(qaOutputDir, { recursive: true });
    fs.writeFileSync(path.join(qaOutputDir, `${sessionId}.jsonl`), transcript, "utf8");
  }
  for (const needle of expected) {
    if (!transcript.includes(needle)) throw new Error(`session transcript missing ${needle}`);
  }
  const events = transcript.trim().split("\n").map(line => JSON.parse(line));
  for (const name of ["bash", "task", "tool_search", "tool_load", "skill"]) {
    const calls = events.flatMap(event => event.type === "message" && event.role === "assistant"
      ? event.tool_calls ?? [] : []).filter(call => call.function?.name === name);
    if (!calls.length || !calls.every(call => events.some(entry => entry.type === "query-event"
      && entry.event?.type === "tool.result" && entry.event.taskId === call.id && entry.event.toolName === name && entry.event.success === true))) {
      throw new Error(`session transcript has no successful result for ${name}`);
    }
    const payload = name === "bash" ? "qa-approval-ok" : name === "skill" ? "qa-skill-body" : undefined;
    if (expected.includes(payload) && !events.some(entry => entry.type === "query-event"
      && entry.event?.type === "tool.result" && entry.event.toolName === name && entry.event.success === true
      && calls.some(call => call.id === entry.event.taskId) && entry.event.output?.includes(payload))) {
      throw new Error(`successful ${name} result is missing the expected payload`);
    }
  }
}

