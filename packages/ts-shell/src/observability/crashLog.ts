/**
 * A record of the runs that ended by falling over.
 *
 * When the process dies on an uncaught exception the terminal is already being
 * torn down and the message scrolls away with it. What is left is a user who
 * knows something went wrong and nothing to show anyone about what. The record
 * keeps the last few crashes where they can be read afterwards.
 *
 * Writes are wrapped in a try/catch that swallows everything. A crash log that
 * throws while recording a crash turns one failure into two, and the second one
 * has nowhere to be written.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveUserDataFile } from "../core/paths/userHome.js";

/** One run that ended badly. */
export interface CrashRecord {
  readonly timestamp: string;
  /** What the process was doing when it fell over. */
  readonly kind: "uncaught-exception" | "unhandled-rejection";
  readonly message: string;
  /** The stack, when the throw carried one. */
  readonly stack?: string;
  readonly cwd: string;
  /** The session in progress, when there was one. */
  readonly sessionId?: string;
}

/**
 * How many crashes are kept.
 *
 * A handful, because the useful question is "what has been going wrong lately"
 * and the answer is in the most recent few. Keeping every crash forever turns a
 * diagnostic file into a growing pile nobody reads.
 */
export const MAX_CRASH_RECORDS = 5;

/** Where the crash records live. */
export function crashLogPath(): string {
  return resolveUserDataFile("crashes.json");
}

/**
 * Every recorded crash, oldest first.
 *
 * A missing or unreadable file reads as no crashes. This runs while the process
 * is already failing, so it must not be the thing that fails.
 */
export function readCrashLog(filePath: string = crashLogPath()): CrashRecord[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCrashRecord);
  } catch {
    return [];
  }
}

/**
 * Record one crash, keeping only the most recent few.
 *
 * Returns the record it wrote, or nothing when even that could not be done —
 * the caller is mid-crash and has nothing useful to do with an error here.
 */
export function recordCrash(
  crash: {
    readonly kind: CrashRecord["kind"];
    readonly error: unknown;
    readonly cwd: string;
    readonly sessionId?: string;
  },
  filePath: string = crashLogPath(),
): CrashRecord | undefined {
  try {
    const error = crash.error;
    const record: CrashRecord = {
      timestamp: new Date().toISOString(),
      kind: crash.kind,
      message: error instanceof Error ? error.message || error.name : String(error),
      ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
      cwd: crash.cwd,
      ...(crash.sessionId ? { sessionId: crash.sessionId } : {}),
    };
    const kept = [...readCrashLog(filePath), record].slice(-MAX_CRASH_RECORDS);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
    return record;
  } catch {
    return undefined;
  }
}

/**
 * Start recording crashes, and return the way to stop.
 *
 * `prependListener` rather than `on`: a handler registered later runs later, and
 * another listener that exits the process first would take the record with it.
 * The listener is added once and removed by the returned function, so a process
 * that installs it twice does not write the same crash twice.
 *
 * **Registering any `uncaughtException` listener replaces Node's default of
 * letting the process die.** A recorder that only writes a file would therefore
 * turn every fatal crash into a process that carries on in a state nobody can
 * reason about — a worse outcome than the crash, and one this module would have
 * caused. So the handler rethrows: the record is written first, and then the
 * error is thrown on from inside the handler, which is what actually terminates
 * the process (Node exits 7 and prints the stack as it would have without us).
 * Verified against Node 24: without a listener the process exits 1, with a
 * recording-only listener it survived, and with the rethrow it terminates.
 *
 * `unhandledRejection` is deliberately different: a rejection is recorded and the
 * process continues. That is also not Node's default — since Node 15 an
 * unhandled rejection is fatal — so this is a real change of behaviour rather
 * than a no-op, and it is the one a long session wants: a stray rejection from a
 * tool is worth knowing about but is not a reason to lose the conversation.
 */
export function installCrashRecorder(options: {
  readonly cwd?: string;
  readonly sessionId?: () => string | undefined;
  readonly filePath?: string;
} = {}): () => void {
  const cwd = options.cwd ?? process.cwd();
  const sessionId = (): string | undefined => options.sessionId?.();

  const onUncaught = (error: unknown): never => {
    recordCrash(
      { kind: "uncaught-exception", error, cwd, ...(sessionId() ? { sessionId: sessionId() } : {}) },
      options.filePath,
    );
    // Rethrown rather than exited: the other listeners still get their turn, and
    // the terminal reports the crash the way it would have without a recorder.
    throw error;
  };
  const onRejection = (reason: unknown): void => {
    recordCrash(
      { kind: "unhandled-rejection", error: reason, cwd, ...(sessionId() ? { sessionId: sessionId() } : {}) },
      options.filePath,
    );
  };

  process.prependListener("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);
  return () => {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onRejection);
  };
}

/** Whether a parsed value has the fields a crash record needs. */
function isCrashRecord(value: unknown): value is CrashRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CrashRecord>;
  return (
    typeof candidate.timestamp === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.cwd === "string" &&
    (candidate.kind === "uncaught-exception" || candidate.kind === "unhandled-rejection")
  );
}
