import {
  projectRebasedSessionRoot,
  projectRootRebase,
} from "./projectRootRebaseProjection.js";

export { projectRebasedSessionRoot } from "./projectRootRebaseProjection.js";

export function projectSessionRootRebase(input: {
  readonly workingMemory: unknown;
  readonly previousRoot: string;
  readonly nextProjectRoot: string;
}): {
  readonly projectRoot: string;
  readonly workingMemory: unknown;
} {
  const projectRoot = projectRebasedSessionRoot(input.nextProjectRoot);
  const rebaseProjection = projectRootRebase({
    value: input.workingMemory,
    previousRoot: input.previousRoot,
    nextRoot: projectRoot,
  });
  return {
    projectRoot,
    workingMemory: rebaseProjection.workingMemory,
  };
}
