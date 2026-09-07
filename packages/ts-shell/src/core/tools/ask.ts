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
    async execute(args, context) {
      const questions = args.questions as AskQuestion[] | undefined;
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return deniedResult("Error: questions array is required for ask tool.");
      }

      if (typeof context?.interactiveAsk === "function") {
        try {
          const userAnswers = await context.interactiveAsk(questions);
          if (userAnswers && Object.keys(userAnswers).length > 0) {
            const formatted = questions
              .map((q) => {
                const qId = q.id || "unspecified";
                const rawDecision = userAnswers[qId];
                const chosen =
                  (rawDecision && rawDecision.trim()) ||
                  (q.recommended !== undefined && q.options?.[q.recommended]
                    ? q.options[q.recommended].label
                    : "No answer provided");
                return `### Question [${qId}]: ${q.question}\n- **User Decision**: ${chosen}`;
              })
              .join("\n\n");
            return approvedResult(`# User Decisions Received\n\n${formatted}`);
          }
        } catch {
          // Fallback to autonomous mode if interactive ask fails or is cancelled
        }
      }
      const formattedQuestions: string[] = [];
      questions.forEach((q, idx) => {
        if (!q || typeof q !== "object") return;
        const qId = typeof q.id === "string" ? q.id : `q_${idx + 1}`;
        const qText = typeof q.question === "string" ? q.question : "Unspecified question";
        formattedQuestions.push(`### Question ${idx + 1} [${qId}]: ${qText}`);
        if (Array.isArray(q.options) && q.options.length > 0) {
          q.options.forEach((opt, optIdx) => {
            if (!opt || typeof opt !== "object") return;
            const label = typeof opt.label === "string" ? opt.label : `Option ${optIdx + 1}`;
            const isRec = q.recommended === optIdx ? " (Recommended)" : "";
            formattedQuestions.push(
              `  - **[${optIdx + 1}] ${label}**${isRec}${opt.description ? `: ${opt.description}` : ""}`,
            );
          });
        }
        formattedQuestions.push("");
      });
      const output = [
        "# User Decision & Clarification Requested",
        "",
        ...formattedQuestions,
        "> *Status: Autonomous execution mode - selected default recommended choices to prevent blocking.*",
      ].join("\n");

      return approvedResult(output);
    },
  };
}
