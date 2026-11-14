import path from 'node:path';
import type { PreparedWriteInspection } from '../../tools/types.js';
import { hashContent } from '../authority/content.js';
import type { PatchPlan } from './plan.js';

/** Preserve every planned effect; only written endpoints have canonical content. */
export function inspectPatchPlan(plan: PatchPlan): PreparedWriteInspection {
  const targets = Object.freeze(plan.files.map(file => Object.freeze({
    path: path.join(file.workspaceRoot, file.relativePath),
    operation: file.content === undefined ? 'delete' as const : 'write' as const,
  })));
  const writeCandidates = Object.freeze(plan.files.flatMap(file => file.content === undefined ? [] : [Object.freeze({
    path: path.join(file.workspaceRoot, file.relativePath),
    content: file.content,
    before: file.before.state === 'exists'
      ? Object.freeze({ state: 'exists' as const, sha256: hashContent(file.before.content) })
      : Object.freeze({ state: 'absent' as const }),
  })]));
  return Object.freeze({ targets, writeCandidates, revision: plan.revision });
}
