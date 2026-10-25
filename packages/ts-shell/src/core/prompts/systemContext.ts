import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { SystemPromptContext } from '../../turn/prompt.js';
import { readSessionModel } from '../../session/model/state.js';
import { skillPrompt } from '../commands/skillful.js';
import {
  DEFAULT_INSTRUCTION_BUDGET_BYTES,
  loadAppendedInstructionFiles,
  loadInstructionFiles,
  renderAppendedInstructions,
  renderInstructionFiles,
} from '../../context/instructions/projectInstructions.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import { projectTrust } from '../security/projectTrust.js';
import type { Skill } from '../skills/skillLoader.js';

export interface SystemPromptContextInput {
  readonly workspaceRoot: string;
  readonly sessionId?: string;
  readonly runtimeConfig?: RuntimeConfig;
  readonly skills: ReadonlyMap<string, Skill>;
  readonly toolNames: readonly string[];
  readonly onSource?: (target: string, content?: Buffer) => void;
}

/** Assemble the exact system-prompt inputs used by a model request. */
export function buildSystemPromptContext(input: SystemPromptContextInput): SystemPromptContext {
  const untrusted = projectTrust.isProjectUntrusted(input.workspaceRoot);
  const instructions = untrusted
    ? { files: [], truncated: false }
    : loadInstructionFiles({
        cwd: input.workspaceRoot,
        maxBytes: input.runtimeConfig?.instructionBudgetBytes,
        onSource: input.onSource,
      });

  if (instructions.truncated) {
    createComponentLogger('project-instructions').warn(
      `Instruction files exceeded the ${input.runtimeConfig?.instructionBudgetBytes ?? DEFAULT_INSTRUCTION_BUDGET_BYTES}-byte budget and were truncated.`,
    );
  }

  const appended = untrusted
    ? { files: [], truncated: false }
    : loadAppendedInstructionFiles({
        cwd: input.workspaceRoot,
        maxBytes: input.runtimeConfig?.instructionBudgetBytes,
        onSource: input.onSource,
      });
  if (appended.truncated) {
    createComponentLogger('project-instructions').warn(
      `Appended instruction files exceeded the ${input.runtimeConfig?.instructionBudgetBytes ?? DEFAULT_INSTRUCTION_BUDGET_BYTES}-byte budget and were truncated.`,
    );
  }

  return {
    instructions: renderInstructionFiles(instructions.files),
    appendedInstructions: renderAppendedInstructions(appended.files),
    skills: skillPrompt(input.skills, readSessionModel(input.sessionId)?.skillful),
    toolNames: input.toolNames,
  };
}
