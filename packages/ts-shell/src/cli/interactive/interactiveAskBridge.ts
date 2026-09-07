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
    const q = questions[i]!;
    const optionsText =
      Array.isArray(q.options) && q.options.length > 0
        ? q.options
            .map((opt, optIdx) => {
              const isRec = q.recommended === optIdx ? " (Recommended)" : "";
              const desc = opt.description ? `: ${opt.description}` : "";
              return `  ${optIdx + 1}. ${opt.label}${isRec}${desc}`;
            })
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
        answers[q.id] = q.options[num - 1]!.label;
        continue;
      }
      const match = q.options.find(
        (opt) => opt.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (match) {
        answers[q.id] = match.label;
        continue;
      }
    }
    if (trimmed) {
      answers[q.id] = trimmed;
    } else if (q.recommended !== undefined && q.options?.[q.recommended]) {
      answers[q.id] = q.options[q.recommended].label;
    } else {
      answers[q.id] = trimmed;
    }
  }

  return answers;
}
