import path from "node:path";
import { decodeWorkspaceRoots, type WorkspaceRoot } from '../../core/workspace/model.js';

export type WorkspaceRootMode = "git-root" | "direct";

export interface ProjectBindingOptions {
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly rootMode?: WorkspaceRootMode;
  readonly requestedWorkspaceRoot?: string;
  readonly targetPathBase?: string;
  readonly gitRoot?: string | null;
}

export interface ProjectSessionBinding {
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly projectRoot: string;
  readonly rootMode?: WorkspaceRootMode;
  readonly requestedWorkspaceRoot?: string;
  readonly targetPathBase?: string;
  readonly gitRoot?: string | null;
}

export interface ProjectBindingInput extends ProjectBindingOptions {
  readonly projectRoot?: string;
}

export interface ProjectBindingDecision extends ProjectBindingInput {}

export function normalizeProjectRootKey(projectRoot: string): string {
  const trimmed = projectRoot.trim();
  if (!trimmed) {
    return "";
  }
  return path.resolve(trimmed).toLowerCase();
}

export function projectSessionBinding(input: {
  readonly projectRoot: string;
  readonly options?: ProjectBindingOptions;
}): ProjectSessionBinding {
  const options = input.options;
  return {
    projectRoot: input.projectRoot,
    ...(options?.workspaceRoots ? { workspaceRoots: decodeWorkspaceRoots(options.workspaceRoots) } : {}),
    ...(options?.rootMode ? { rootMode: options.rootMode } : {}),
    ...(options?.requestedWorkspaceRoot
      ? { requestedWorkspaceRoot: options.requestedWorkspaceRoot }
      : {}),
    ...(options?.targetPathBase ? { targetPathBase: options.targetPathBase } : {}),
    ...(options && Object.prototype.hasOwnProperty.call(options, "gitRoot")
      ? { gitRoot: options.gitRoot ?? null }
      : {}),
  };
}

export function normalizeProjectBinding(
  binding: ProjectBindingInput,
): ProjectBindingDecision {
  return {
    ...(binding.projectRoot?.trim()
      ? { projectRoot: binding.projectRoot.trim() }
      : {}),
    ...(binding.rootMode ? { rootMode: binding.rootMode } : {}),
    ...(binding.requestedWorkspaceRoot?.trim()
      ? { requestedWorkspaceRoot: binding.requestedWorkspaceRoot.trim() }
      : {}),
    ...(binding.targetPathBase?.trim()
      ? { targetPathBase: binding.targetPathBase.trim() }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(binding, "gitRoot")
      ? { gitRoot: binding.gitRoot?.trim() || null }
      : {}),
  };
}
