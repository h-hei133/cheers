import { assertConfigScopes } from './capture.js';
import type { ConfigScopes } from './model.js';
import { assertScopePath, captureScopePath } from './path.js';

/** Capture first; later awaits can only verify that identity, never select another scope. */
export function scopeAdmission(scopes: ConfigScopes | undefined, target: string): () => string | undefined {
  if (!scopes) return () => undefined;
  try {
    assertConfigScopes(scopes);
    const selected = captureScopePath(target, scopes.workspace.canonical);
    return () => {
      try { assertConfigScopes(scopes); assertScopePath(selected); return undefined; }
      catch { return 'Configuration scope identity changed; reload and start a new operation.'; }
    };
  } catch { return () => 'Configuration scope identity could not be verified; reload before starting new actions.'; }
}
