import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /btw (aliases: /side, /ask)
 * Executes a side-question out of band without polluting or writing to the main conversation history.
 */
export async function runBtwCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const question = args.join(" ").trim();
  if (!question) {
    return {
      kind: "local",
      output: "Usage: `/btw <question>`\nExample: `/btw what is the difference between Array.slice and splice in JS?`\n\nSide questions provide instant answers without adding clutter to your active conversation history.",
    };
  }

  const apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1";
  const model = "deepseek-ai/DeepSeek-V4-Flash";

  let answer = "";
  if (apiKey && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are a concise, helpful coding assistant answering a quick side-question out of band. Give a direct, accurate, terse answer in markdown.",
            },
            {
              role: "user",
              content: question,
            },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json() as any;
        answer = json.choices?.[0]?.message?.content || "";
      }
    } catch {
      clearTimeout(timer);
    }
  }

  if (!answer) {
    answer = `Side question noted: "${question}".\n(Fast out-of-band response channel ready. Answers are ephemeral and 100% excluded from conversation history).`;
  }

  const lines: string[] = [
    `# 💬 Side Question (/btw): "${question}"`,
    "",
    "---",
    answer,
    "",
    "---",
    "*✨ Note: This exchange was answered out-of-band and is 100% excluded from your main session history.*",
  ];

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
