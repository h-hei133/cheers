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
    briefPath: { type: 'string', minLength: 1, maxLength: 2048 }, save: { type: 'boolean' },
    methods: { type: 'object', additionalProperties: false, required: ['originalInput', 'skills', 'modifiers'], properties: {
      originalInput: { type: 'string', minLength: 1, maxLength: 32768 },
      skills: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false,
        required: ['name', 'identity', 'source', 'digest', 'body'], properties: {
          name: { type: 'string', minLength: 1, maxLength: 128 }, identity: { type: 'string', minLength: 1, maxLength: 4096 },
          source: { enum: ['user', 'project', 'cli', 'extension'] }, digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          body: { type: 'string', maxLength: 65536 },
        } } },
      modifiers: { type: 'array', maxItems: 16, items: { type: 'object', additionalProperties: false,
        required: ['name', 'instruction'], properties: { name: identifier, instruction: { type: 'string', minLength: 1, maxLength: 32768 } } } },
    } },
  },
};
