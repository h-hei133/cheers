import type { Interface as ReadlineInterface } from "node:readline";
import type { AskQuestion, AskResponse, AskCancellationReason } from "../../core/tools/ask/contract.js";

function askOne(rl: ReadlineInterface, text: string, signal?: AbortSignal): Promise<{ answer: string } | { cancellationReason: AskCancellationReason }> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (answer?: string, error?: unknown, cancellationReason: AskCancellationReason = 'unknown'): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      rl.off('close', closed);
      rl.off('SIGINT', interrupted);
      controller.abort();
      if (error !== undefined) reject(error);
      else resolve(answer === undefined ? { cancellationReason } : { answer });
    };
    const cancel = (): void => finish(undefined, undefined, 'parent-abort');
    const closed = (): void => finish(undefined, undefined, 'input-closed');
    const interrupted = (): void => finish(undefined, undefined, 'user-cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    rl.once('close', closed);
    rl.once('SIGINT', interrupted);
    if (signal?.aborted) { cancel(); return; }
    try { rl.question(text, { signal: controller.signal }, answer => finish(answer)); }
    catch (error) { finish(undefined, error); }
  });
}

export async function promptInteractiveQuestions(
  rl: ReadlineInterface | null,
  questions: readonly AskQuestion[],
  signal?: AbortSignal,
): Promise<AskResponse> {
  if (signal?.aborted) return { status: 'cancelled', answers: {}, cancellationReason: 'parent-abort' };
  if (!rl) return { status: 'unavailable', answers: {} };

  const answers: Record<string, string> = Object.create(null);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") continue;
    const qId = q.id;
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

    let response: Awaited<ReturnType<typeof askOne>>;
    try { response = await askOne(rl, promptText, signal); }
    catch { return { status: 'error', answers }; }
    if ('cancellationReason' in response) return { status: 'cancelled', answers, cancellationReason: response.cancellationReason };
    const rawAnswer = response.answer;
    const trimmed = rawAnswer.trim();
    if (Array.isArray(q.options) && q.options.length > 0) {
      const num = /^[1-9]\d*$/.test(trimmed) ? Number(trimmed) : Number.NaN;
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
    if (trimmed) answers[qId] = rawAnswer;
  }

  return { status: 'completed', answers };
}
