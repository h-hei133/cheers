import type { Interface as ReadlineInterface } from "node:readline";
import type { AskQuestion } from "../../core/tools/ask.js";

function askOne(rl: ReadlineInterface, text: string): Promise<string> {
  return new Promise<string>((resolve) => {
    rl.question(text, resolve);
  });
}

export async function promptInteractiveQuestions(
  rl: ReadlineInterface | null,
  questions: readonly AskQuestion[],
): Promise<Record<string, string>> {
  if (!rl || questions.length === 0) {
    return {};
  }

  const answers: Record<string, string> = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") continue;
    const qId = typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q_${i + 1}`;
    const optionsText =
      Array.isArray(q.options) && q.options.length > 0
        ? q.options
            .map((opt, optIdx) => {
              if (!opt || typeof opt !== "object") return "";
              const isRec = q.recommended === optIdx ? " (Recommended)" : "";
              const desc = opt.description ? `: ${opt.description}` : "";
              const label = typeof opt.label === "string" ? opt.label : `Option ${optIdx + 1}`;
              return `  ${optIdx + 1}. ${label}${isRec}${desc}`;
            })
            .filter(Boolean)
            .join("\n")
        : "";
    const promptText = optionsText
      ? `[Question ${i + 1}/${questions.length}] ${q.question}\n${optionsText}\nChoose (1-${q.options!.length}) or type answer: `
      : `[Question ${i + 1}/${questions.length}] ${q.question}\nAnswer: `;

    const rawAnswer = await askOne(rl, promptText);
    const trimmed = rawAnswer.trim();
    if (Array.isArray(q.options) && q.options.length > 0) {
      const num = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= q.options.length) {
        answers[qId] = q.options[num - 1]!.label;
        continue;
      }
      const match = q.options.find(
        (opt) => opt?.label && opt.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (match) {
        answers[qId] = match.label;
        continue;
      }
    }
    if (trimmed) {
      answers[qId] = trimmed;
    } else if (q.recommended !== undefined && q.options?.[q.recommended]?.label) {
      answers[qId] = q.options[q.recommended].label;
    } else {
      answers[qId] = trimmed;
    }
  }

  return answers;
}
