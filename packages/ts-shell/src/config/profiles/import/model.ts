import type { ProfileContext } from '../../../core/paths/profile/context.js';
import type { DirectoryIdentity } from '../../../core/paths/profile/identity.js';

export const IMPORT_LIMITS = Object.freeze({ files: 1024, bytes: 32 * 1024 * 1024, fileBytes: 2 * 1024 * 1024, depth: 12 });
export const IMPORT_CATEGORIES = ['config', 'catalog', 'definitions', 'history'] as const;
export type ImportCategory = typeof IMPORT_CATEGORIES[number];
export interface ImportRequest {
  readonly source: ProfileContext;
  readonly target: ProfileContext;
  readonly workspace: DirectoryIdentity;
  readonly categories: readonly ImportCategory[];
  readonly excludedSessionId?: string;
}
export interface ImportSource {
  readonly path: string;
  readonly hash: string;
  readonly identity: string;
}
export interface ImportFile {
  readonly relative: string;
  readonly content: string;
  readonly metadata: boolean;
}
export interface ImportPlan {
  readonly version: 1;
  readonly digest: string;
  readonly request: ImportRequest;
  readonly sources: readonly ImportSource[];
  readonly files: readonly ImportFile[];
  readonly bytes: number;
}
export const IMPORT_EXCLUSIONS = 'Credentials and OAuth/MCP tokens, grants, hooks, packages/scripts, jobs, pending requests, caches, current-session selection and other workspaces are excluded. Connections require independent login. Only supported user configuration, catalog, Markdown definitions and current-workspace conversation history are selected.';
