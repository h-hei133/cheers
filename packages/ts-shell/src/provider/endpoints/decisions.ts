import { isRecord } from '../../core/values/record.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';
import type { ProviderFailureClass } from '../registry/provider.js';
import { declareEndpoint } from './kinds.js';
import { responseUsage } from './responses/output.js';

export const DECISIONS_ENDPOINT = 'openai-decisions';

export type ClassificationQuestion =
  | { readonly type: 'choice'; readonly instructions: string; readonly criteria: Readonly<Record<string, string>> }
  | { readonly type: 'score'; readonly instructions: string; readonly criteria: readonly string[] }
  | { readonly type: 'bool'; readonly instructions: string; readonly criteria: { readonly true: string; readonly false: string } };

export type ClassificationAnswer =
  | { readonly type: 'choice'; readonly choice: string; readonly probabilities: Readonly<Record<string, number>>; readonly confidence: number }
  | { readonly type: 'score'; readonly score: number; readonly probabilities: Readonly<Record<string, number>>; readonly confidence: number }
  | { readonly type: 'bool'; readonly probability: number };

function unavailable(): never {
  throw new Error('The classification endpoint requires named questions.');
}

declareEndpoint(DECISIONS_ENDPOINT, {
  path: () => '/decisions',
  headers: key => ({ 'content-type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }),
  usageInput: 'inclusive',
  contextFields: { conversation: 'input', tools: 'questions' },
  body: unavailable,
  turnBody: unavailable,
  readStream: unavailable,
  readBody: value => ({ choices: [], usage: isRecord(value) ? responseUsage(value.usage) : undefined }),
});

function wireQuestion(name: string, question: ClassificationQuestion): Record<string, unknown> {
  const { instructions } = question;
  switch (question.type) {
    case 'choice': return { name, type: 'choice', instructions,
      choices: Object.entries(question.criteria).map(([value, description]) => ({ value, description })) };
    case 'score': return { name, type: 'score', instructions, levels: question.criteria.map(label => ({ label })) };
    case 'bool': return { name, type: 'predicate',
      instructions: `${instructions}\n\nTrue means: ${question.criteria.true}\nFalse means: ${question.criteria.false}` };
  }
}

export function decisionsBody(model: string, state: Readonly<Record<string, unknown>>,
  questions: Readonly<Record<string, ClassificationQuestion>>, images: readonly ImageContent[]): Record<string, unknown> {
  const input = [{ role: 'user', content: [{ type: 'input_json', data: state },
    ...images.map(image => ({ type: 'input_image', image_url: `data:${image.mimeType};base64,${image.data}` }))] }];
  return { model, input,
    questions: Object.entries(questions).map(([name, question]) => wireQuestion(name, question)) };
}

export class DecisionResponseError extends Error {
  constructor(readonly failure: ProviderFailureClass) {
    super('Classification answer could not be verified.');
  }
}

function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DecisionResponseError('provider_output_invalid');
  }
  return value;
}

function probabilities(value: unknown, keys: ReadonlySet<string | number>): Readonly<Record<string, number>> {
  if (!Array.isArray(value) || value.length !== keys.size) throw new DecisionResponseError('provider_output_invalid');
  const result: Record<string, number> = Object.create(null);
  for (const item of value) {
    if (!isRecord(item) || !(typeof item.value === 'string' || typeof item.value === 'number')
      || !keys.has(item.value) || Object.hasOwn(result, item.value)) {
      throw new DecisionResponseError('provider_output_invalid');
    }
    result[item.value] = probability(item.probability);
  }
  return Object.freeze(result);
}

function decisionAnswer(answer: Record<string, unknown>, question: ClassificationQuestion): ClassificationAnswer {
  if (answer.type === 'refusal') throw new DecisionResponseError('provider_safety_block');
  if (question.type === 'choice' && answer.type === 'choice'
      && typeof answer.choice === 'string' && Object.hasOwn(question.criteria, answer.choice)) {
    return Object.freeze({ type: 'choice', choice: answer.choice,
      probabilities: probabilities(answer.probabilities, new Set(Object.keys(question.criteria))), confidence: probability(answer.confidence) });
  }
  if (question.type === 'bool' && answer.type === 'predicate') {
    return Object.freeze({ type: 'bool', probability: probability(answer.probability) });
  }
  if (question.type === 'score' && answer.type === 'score' && typeof answer.score === 'number'
      && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= question.criteria.length - 1) {
    return Object.freeze({ type: 'score', score: answer.score,
      probabilities: probabilities(answer.probabilities, new Set(question.criteria.keys())), confidence: probability(answer.confidence) });
  }
  throw new DecisionResponseError('provider_output_invalid');
}

export function decisionAnswers(value: unknown, questions: Readonly<Record<string, ClassificationQuestion>>): Readonly<Record<string, ClassificationAnswer>> {
  if (!isRecord(value) || !Array.isArray(value.answers)) throw new DecisionResponseError('provider_response_malformed');
  if (value.answers.length !== Object.keys(questions).length) throw new DecisionResponseError('provider_output_insufficient');
  const answers: Record<string, ClassificationAnswer> = Object.create(null);
  for (const item of value.answers) {
    if (!isRecord(item) || typeof item.name !== 'string' || !Object.hasOwn(questions, item.name)
      || Object.hasOwn(answers, item.name)) throw new DecisionResponseError('provider_output_invalid');
    answers[item.name] = decisionAnswer(item, questions[item.name]!);
  }
  return Object.freeze(answers);
}
