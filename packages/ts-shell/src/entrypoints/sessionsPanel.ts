import * as readline from "node:readline";
import path from "node:path";
import type {
  SessionManager,
  SessionReentrySummary,
} from "../session/SessionManager.js";
import type { ShellRuntimeContext } from "../core/shell/runtimeContext.js";

interface PanelResult {
  switchedSessionId?: string;
}

export async function openSessionsPanel(input: {
  rl: readline.Interface;
  sessionManager: SessionManager;
  runtimeContext: ShellRuntimeContext;
}): Promise<PanelResult> {
  const { rl, sessionManager, runtimeContext } = input;
  const stdin = process.stdin;
  const stdout = process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) {
    return {};
  }

  let sessions = sessionManager.listReentrySummaries({
    preferredProjectRoot: runtimeContext.projectRoot,
  });
  let selected = Math.min(
    sessions.findIndex((s) => s.id === runtimeContext.session.id),
    Math.max(sessions.length - 1, 0),
  );
  if (selected < 0) {
    selected = 0;
  }
  let top = 0;
  const pageSize = 10;
  let switchedSessionId: string | undefined;

  readline.emitKeypressEvents(stdin);
  const previousRawMode = stdin.isRaw;
  rl.pause();
  stdin.resume();
  stdin.setRawMode(true);

  const redraw = () => {
    stdout.write("\x1b[2J\x1b[H");
    stdout.write("Sessions Panel\n");
    stdout.write(
      "Up/Down: move  Enter: switch  Ctrl+R: rename  Ctrl+D: delete  Esc/Q: close\n\n",
    );

    if (sessions.length === 0) {
      stdout.write("(no sessions)\n");
      return;
    }

    if (selected < top) {
      top = selected;
    }
    if (selected >= top + pageSize) {
      top = selected - pageSize + 1;
    }

    const visible = sessions.slice(top, top + pageSize);
    for (let i = 0; i < visible.length; i += 1) {
      const session = visible[i];
      const absoluteIndex = top + i;
      const marker = absoluteIndex === selected ? ">" : " ";
      const active = session.id === runtimeContext.session.id ? "*" : " ";
      const title = session.title?.trim() || "(untitled)";
      const projectLabel = path.basename(session.projectRoot) || session.projectRoot;
      const recoverability = session.recoverable ? "recoverable" : "blocked";
      const cue = buildResumeCue(session);
      stdout.write(
        `${marker}${active} ${title}  [${session.status}] [${recoverability}]  ${session.id}\n`,
      );
      stdout.write(
        `   @${projectLabel}  updated=${toRelativeTime(session.updatedAt)}${cue ? `  ${cue}` : ""}\n`,
      );
    }

    const start = Math.min(top + 1, sessions.length);
    const end = Math.min(top + pageSize, sessions.length);
    stdout.write(`\nShowing ${start}-${end} / ${sessions.length}\n`);
  };

  const askLine = (question: string): Promise<string> =>
    new Promise((resolve) => {
      stdin.setRawMode(false);
      rl.question(question, (answer) => {
        rl.pause();
        stdin.resume();
        stdin.setRawMode(true);
        resolve(answer);
      });
    });

  const confirm = (question: string): Promise<boolean> =>
    askLine(`${question} (y/N): `).then(
      (answer) => answer.trim().toLowerCase() === "y",
    );

  redraw();

  await new Promise<void>((resolve) => {
    let closed = false;

    const teardown = () => {
      if (closed) {
        return;
      }
      closed = true;
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode(previousRawMode);
      rl.resume();
      stdout.write("\x1b[2J\x1b[H");
    };

    const onKeypress = async (_str: string, key: readline.Key) => {
      if (key.name === "up") {
        selected = Math.max(0, selected - 1);
        redraw();
        return;
      }
      if (key.name === "down") {
        selected = Math.min(sessions.length - 1, selected + 1);
        redraw();
        return;
      }
      if (key.name === "pageup") {
        selected = Math.max(0, selected - pageSize);
        redraw();
        return;
      }
      if (key.name === "pagedown") {
        selected = Math.min(sessions.length - 1, selected + pageSize);
        redraw();
        return;
      }
      if (key.ctrl && key.name === "r") {
        if (!sessions[selected]) {
          return;
        }
        const current = sessions[selected];
        const nextTitle = await askLine(
          `Rename session ${current.id} to: `,
        );
        sessionManager.renameSession(current.id, nextTitle);
        sessions = sessionManager.listReentrySummaries({
          preferredProjectRoot: runtimeContext.projectRoot,
        });
        selected = Math.min(selected, Math.max(sessions.length - 1, 0));
        redraw();
        return;
      }
      if (key.ctrl && key.name === "d") {
        if (!sessions[selected]) {
          return;
        }
        const current = sessions[selected];
        const ok = await confirm(`Delete session ${current.id}?`);
        if (ok) {
          sessionManager.deleteSession(current.id);
          sessions = sessionManager.listReentrySummaries({
            preferredProjectRoot: runtimeContext.projectRoot,
          });
          selected = Math.min(selected, Math.max(sessions.length - 1, 0));
        }
        redraw();
        return;
      }
      if (key.name === "return") {
        const target = sessions[selected];
        if (target) {
          switchedSessionId = target.id;
        }
        teardown();
        resolve();
        return;
      }
      if (key.name === "escape" || key.name === "q") {
        teardown();
        resolve();
        return;
      }
    };

    stdin.on("keypress", onKeypress);
  });

  return { switchedSessionId };
}

function buildResumeCue(session: SessionReentrySummary): string {
  if (session.pendingPrompt?.trim()) {
    return `pending: ${truncate(session.pendingPrompt.trim(), 44)}`;
  }
  if (session.lastUserMessage?.trim()) {
    return `last: ${truncate(session.lastUserMessage.trim(), 44)}`;
  }
  if (session.lastAssistantMessage?.trim()) {
    return `assistant: ${truncate(session.lastAssistantMessage.trim(), 44)}`;
  }
  return "";
}

function toRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
