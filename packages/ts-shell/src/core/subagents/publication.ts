import { filePublication } from '../../edit/authority/publication.js';
import { DEFINITION_BYTES } from './definition.js';
import type { ToolDefinition } from '../../tools/types.js';

export function agentPublication(target: string, next: string | undefined, admission: () => string | undefined, currentAdmission: () => string | undefined): ToolDefinition {
  return filePublication(target, next, DEFINITION_BYTES, admission, currentAdmission, 'Agent definition');
}
