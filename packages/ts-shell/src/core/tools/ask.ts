import { deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";
import { validateToolArguments } from './arguments.js';
import type { AskQuestion, AskResponse } from './ask/contract.js';
import { askResult } from './ask/result.js';
export type { AskOption, AskQuestion } from './ask/contract.js';

/**
 * /ask tool
 * Prompts user with structured multiple-choice questions or confirmations during task execution.
 */
export function createAskToolDefinition(): ToolDefinition {
  const definition: ToolDefinition = {
    name: "ask",
    description:
      "Ask the user structured questions, present multiple-choice architectural options, or request user confirmation during execution.",
    argsSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique question ID" },
              question: { type: "string", description: "The question text" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["label"],
                },
                description: "Available choices for the user",
              },
              recommended: {
                type: "integer",
                minimum: 0,
                description: "0-based index of recommended option",
              },
            },
            required: ["id", "question"],
          },
          description: "List of structured questions to ask the user.",
        },
      },
      required: ["questions"],
    },
    async execute(args, context) {
      try {
        validateToolArguments(definition.argsSchema, args);
      } catch {
        return deniedResult('Invalid ask questions.');
      }
      const questions = args.questions as AskQuestion[];
      const ids = new Set<string>();
      for (const question of questions) {
        if (!question.id.trim() || !question.question.trim() || ids.has(question.id)
          || (question.recommended !== undefined && !question.options?.[question.recommended])) {
          return deniedResult('Invalid or duplicate question ID, empty question, or unavailable recommendation.');
        }
        ids.add(question.id);
      }
      if (context.abortSignal?.aborted) return askResult(questions, { status: 'cancelled', answers: {}, cancellationReason: 'parent-abort' });
      if (!context.interactiveAsk) return askResult(questions, { status: 'unavailable', answers: {} });
      try {
        const response: AskResponse = await context.interactiveAsk(questions, context.abortSignal);
        if (!response || !['completed', 'cancelled', 'unavailable', 'error'].includes(response.status)
          || !response.answers || typeof response.answers !== 'object' || Array.isArray(response.answers)) {
          return askResult(questions, { status: 'error', answers: {} });
        }
        return askResult(questions, context.abortSignal?.aborted ? { ...response, status: 'cancelled', cancellationReason: 'parent-abort' } : response);
      } catch {
        return askResult(questions, { status: context.abortSignal?.aborted ? 'cancelled' : 'error', answers: {},
          ...(context.abortSignal?.aborted ? { cancellationReason: 'parent-abort' as const } : {}) });
      }
    },
  };
  return definition;
}
