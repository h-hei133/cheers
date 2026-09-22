/**
 * The skill tool: loading a skill's instructions by name.
 *
 * Skills are advertised to the model as a list of names and descriptions, and the
 * body is fetched here on request. The body comes from what discovery already
 * read into memory, so this tool never touches a path the model chose.
 *
 * That is the reason it exists rather than reusing the file reader. Skills live
 * in the user's home directory as well as in the project, and the file reader is
 * confined to the workspace — so asking it to load a user-level skill would be
 * refused. Loading by name sidesteps the confinement instead of weakening it:
 * the model can only ask for skills this process already found and read, which is
 * a far smaller surface than "any path".
 */

import { approvedResult, deniedResult } from './toolResultLifecycle.js'
import type { ToolDefinition } from '../../tools/types.js'
import type { Skill } from '../skills/skillLoader.js'

/** The skills a tool call may load, keyed by name. */
export type SkillCatalog = ReadonlyMap<string, Skill>

export function createSkillToolDefinition(skills: SkillCatalog): ToolDefinition {
  return {
    name: 'skill',
    description:
      'Load the full instructions for a skill listed in <available_skills>. Use it when the task matches a skill description.',
    argsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the skill, exactly as listed in <available_skills>.',
        },
      },
      required: ['name'],
    },
    permissions: { check: () => [] },
    async execute(args) {
      const requested = typeof args.name === 'string' ? args.name.trim() : ''
      if (requested === '') {
        return deniedResult('No skill name was given.')
      }

      const skill = skills.get(requested)
      if (!skill) {
        // Naming what is available turns a dead end into a next step; a bare
        // "not found" leaves the model guessing at spellings.
        const available = [...skills.keys()].sort()
        return deniedResult(
          available.length === 0
            ? `No skill named '${requested}' exists, and no skills are available.`
            : `No skill named '${requested}' exists. Available: ${available.join(', ')}.`,
        )
      }

      // The source path is a label, not an instruction: it tells the model where
      // the rules come from without inviting a read of a path the workspace jail
      // would refuse.
      return approvedResult(
        `<skill_content name="${skill.name}" source="${skill.filePath}">\n${skill.body}\n</skill_content>`,
      )
    },
  }
}
