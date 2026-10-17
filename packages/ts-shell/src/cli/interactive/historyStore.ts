import * as fs from "node:fs";
import * as path from "node:path";
import { profileWorkspaceDir } from '../../core/paths/profile/workspace.js';
import { assertProfileStorage } from '../../core/paths/profile/context.js';

const HISTORY_DIR = ".ts-shell";
const HISTORY_FILE = "prompt-history.txt";
const MAX_HISTORY_LINES = 500;

function historyPath(projectRoot: string): string {
  const file = path.join(profileWorkspaceDir(projectRoot) ?? path.join(projectRoot, HISTORY_DIR), HISTORY_FILE);
  assertProfileStorage(file);
  return file;
}

/**
 * Read stored prompt and command history from disk.
 * Returns lines in chronological order (oldest to newest).
 */
export function loadPromptHistory(projectRoot: string): string[] {
  try {
    const file = historyPath(projectRoot);
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, "utf8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.slice(Math.max(0, lines.length - MAX_HISTORY_LINES));
  } catch {
    return [];
  }
}

/**
 * Append a submitted prompt or command to the disk history file.
 */
export function appendPromptHistory(projectRoot: string, prompt: string): void {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  try {
    const file = historyPath(projectRoot);
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const singleLine = trimmed.replace(/\r?\n/g, "\\n");
    assertProfileStorage(file);
    fs.appendFileSync(file, `${singleLine}\n`, "utf8");
  } catch {
    // Non-fatal: disk write error should never interrupt the interactive turn
  }
}
