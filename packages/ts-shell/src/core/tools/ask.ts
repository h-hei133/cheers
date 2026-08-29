import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  id: string;
  question: string;
  options?: AskOption[];
  recommended?: number;
}

/**
 * /ask tool
 * Prompts user with structured multiple-choice questions or confirmations during task execution.
 */
export function createAskToolDefinition(): ToolDefinition {
  return {
    name: "ask",
    description:
      "Ask the user structured questions, present multiple-choice architectural options, or request user confirmation during execution.",
    argsSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
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
                type: "number",
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
    permissions: { check: () => [] },
    async execute(args, _context) {
      const questions = args.questions as AskQuestion[] | undefined;
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return deniedResult("Error: questions array is required for ask tool.");
      }

      const formattedQuestions: string[] = [];

      questions.forEach((q, idx) => {
        formattedQuestions.push(`### Question ${idx + 1} [${q.id}]: ${q.question}`);
        if (q.options && q.options.length > 0) {
          q.options.forEach((opt, optIdx) => {
            const isRec = q.recommended === optIdx ? " (Recommended)" : "";
            formattedQuestions.push(
              `  - **[${optIdx + 1}] ${opt.label}**${isRec}${opt.description ? `: ${opt.description}` : ""}`,
            );
          });
        }
        formattedQuestions.push("");
      });

      const output = [
        "# User Decision & Clarification Requested",
        "",
        ...formattedQuestions,
        "> *Auto-default choice chosen based on recommendation for autonomous workflow execution.*",
      ].join("\n");

      return approvedResult(output);
    },
  };
}
