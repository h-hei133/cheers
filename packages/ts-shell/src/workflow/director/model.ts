import type { ModelChoice } from '../../core/models/selection.js';
import type { BoundSessionScope } from '../../session/store/bound.js';

export interface Director {
  readonly id: string;
  readonly scope: BoundSessionScope;
  readonly directory: { readonly path: string; readonly identity: string };
  readonly source: ModelChoice;
  readonly worker: ModelChoice;
  readonly modelRevision?: string;
  readonly createdAt: number;
  readonly phase: 'enabled' | 'stopping' | 'disabled' | 'unknown';
  readonly workers: readonly string[];
  readonly endedAt?: number;
  /** Selection is released without upgrading uncertain worker outcomes. */
  readonly retired?: true;
}
export interface DirectorState { readonly version: 1; readonly revision: number; readonly cycles: readonly Director[] }
