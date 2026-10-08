import { realpathSync, statSync } from 'node:fs';
import { BrowserSessionManager, defaultBrowserSessionManager } from '../sessionManager.js';
import type { ToolExecutionContext } from '../../tools/types.js';

const sessions = new Map<string, BrowserSessionManager>();

/** A turn/catalog cannot inherit another session's browser context. */
export function browserSession(context: Pick<ToolExecutionContext, 'workspaceRoot' | 'sessionId'>): BrowserSessionManager {
  // Compatibility callers explicitly omit session identity and use the exported global manager.
  if (!context.sessionId) return defaultBrowserSessionManager;
  const root = realpathSync(context.workspaceRoot);
  const stats = statSync(root, { bigint: true });
  const key = JSON.stringify([context.sessionId, root, `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`]);
  let manager = sessions.get(key);
  if (!manager) {
    if (sessions.size >= 16) {
      for (const [identity, owner] of sessions) { if (owner.isReleased()) sessions.delete(identity); }
    }
    if (sessions.size >= 16) throw new Error('Browser session capacity is exhausted. Restart the runtime to release inactive session owners.');
    manager = new BrowserSessionManager(); sessions.set(key, manager);
  }
  return manager;
}
