import type { ToolExecutionResult } from '../../../tools/types.js';
import type { AskQuestion, AskResponse } from './contract.js';

/** Missing answers never gain user provenance, even when a recommendation exists. */
export function askResult(questions: readonly AskQuestion[], response: AskResponse): ToolExecutionResult {
  const responses = questions.map(question => {
    const value = Object.hasOwn(response.answers, question.id) ? response.answers[question.id] : undefined;
    const answer = typeof value === 'string' && value.trim() ? value : undefined;
    return answer === undefined ? { id: question.id, source: 'none' as const }
      : { id: question.id, source: 'user' as const, answer };
  });
  const answered = responses.filter(response => response.source === 'user').length;
  const status = response.status === 'completed'
    ? answered === questions.length ? 'answered' : answered > 0 ? 'partial' : 'unanswered'
    : response.status;
  const cancellationReason = status === 'cancelled'
    ? ['parent-abort', 'user-cancelled', 'input-closed'].includes(response.cancellationReason ?? '')
      ? response.cancellationReason : 'unknown' : undefined;
  const output = [`# Questions: ${status}`, ...(cancellationReason ? [`Cancellation: ${cancellationReason}`] : []), ...questions.map((question, index) => {
    const response = responses[index]!;
    return `### Question [${question.id}]: ${question.question}\n${response.source === 'user'
      ? `- **User answer**: ${response.answer}` : '- No answer submitted.'}`;
  }), 'Answers are clarification only; execution permissions are checked separately.'].join('\n\n');
  return { success: status === 'answered', output,
    metadata: { ask: { status, responses, ...(cancellationReason ? { cancellationReason } : {}) } } };
}
