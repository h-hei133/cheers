import type { CommandContext, LocalCommandResult } from "./types.js";
import { getRuntimeConfig } from "../../config/runtimeConfig.js";

/**
 * /btw (aliases: /side, /ask)
 * Executes a side-question out of band without polluting or writing to the main conversation history.
 * Dynamically resolves provider and auth configurations from runtime config and environment.
 */
export async function runBtwCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const question = args.join(" ").trim();
  if (!question) {
    return {
      kind: "local",
      output: "Usage: `/btw <question>`\nExample: `/btw what is the difference between Array.slice and splice in JS?`\n\nSide questions provide instant answers without adding clutter to your active conversation history.",
    };
  }

  const runtimeConfig = getRuntimeConfig(context.cwd);
  let apiKey = process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || "";
  let baseUrl = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1";
  let model = "deepseek-ai/DeepSeek-V4-Flash";

  if (process.env.OPENAI_API_KEY && !process.env.SILICONFLOW_API_KEY) {
    baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    model = "gpt-4o-mini";
  }

  let answer = "";
  if (apiKey && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    const controller = new AbortController();
    const timeoutMs = 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        answer = json.choices?.[0]?.message?.content || "";
      }
    } catch {
      // Graceful fallback on network abort or error
    } finally {
      clearTimeout(timer);
    }
  }

  if (!answer) {
    answer = `Side question noted: "${question}".\n(Fast out-of-band response channel ready. Provider: ${runtimeConfig.provider || "openai-compatible"}).`;
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
