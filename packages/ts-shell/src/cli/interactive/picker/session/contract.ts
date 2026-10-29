import type { SessionManager } from '../../../../session/SessionManager.js';
import type { SessionSelectionContext } from '../../../../session/navigation/selection.js';
import type { SessionCatalogContinuation } from '../../../../session/store/catalog/model.js';

export interface SessionPickerOptions {
  /** Enter resumes a session or toggles its existing pinned metadata. */
  readonly action?: 'resume' | 'pin';
  readonly sessionManager: SessionManager;
  readonly context: () => SessionSelectionContext;
  readonly admission?: () => string | undefined;
  /** Resume the chosen session; the host owns how that is executed. */
  readonly resume: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Delete a session permanently, with confirmation handled by the host. */
  readonly delete?: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Rename a session. */
  readonly rename?: (sessionId: string, title: string, version?: string) => Promise<string | undefined>;
  /** Toggle a session's pinned state. */
  readonly pin?: (sessionId: string, version?: string) => Promise<string | undefined>;
  /** Page size, bounded by the catalogue's forty-row presentation budget. */
  readonly initialLimit?: number;
  readonly continuation?: SessionCatalogContinuation;
  /** Search every authorized project; actions still enforce the current scope. */
  readonly allProjects?: boolean;
  /** Resume the picker with a previously entered catalogue query. */
  readonly initialQuery?: string;
}
