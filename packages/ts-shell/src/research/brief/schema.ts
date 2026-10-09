export const text = { type: 'string', minLength: 1, maxLength: 4096 };
export const texts = { type: 'array', maxItems: 32, items: text };
export const identifier = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_.:-]+$' };
export const briefSchema = {
  type: 'object', additionalProperties: false,
  required: ['revision', 'question', 'mode', 'questions', 'anchors', 'scope', 'exclusions'],
  properties: {
    revision: { type: 'integer', minimum: 1 }, question: text,
    mode: { enum: ['software', 'paper', 'mixed'] }, scope: text, exclusions: texts,
    questions: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', additionalProperties: false,
      required: ['id', 'text'], properties: { id: identifier, text } } },
    anchors: { type: 'object', additionalProperties: false, required: ['versions', 'platforms', 'conditions'],
      properties: { versions: texts, platforms: texts, conditions: texts } },
  },
};
export const requestSchema = {
  type: 'object', additionalProperties: false, required: ['question', 'depth', 'save'],
  properties: { question: text, mode: { enum: ['software', 'paper', 'mixed'] }, depth: { enum: ['quick', 'deep'] },
    briefPath: { type: 'string', minLength: 1, maxLength: 2048 }, save: { type: 'boolean' } },
};
