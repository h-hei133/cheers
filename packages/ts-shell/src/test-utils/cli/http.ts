import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export async function createOpenAiHttpServer(options?: {
  chatDelayMs?: number;
  failFirstChatAttempt?: boolean;
}): Promise<{
  baseUrl: string;
  logs: Array<{ url: string; authorization: string }>;
  close: () => Promise<void>;
}> {
  const chatDelayMs = options?.chatDelayMs ?? 0;
  let firstChatAttempt = true;
  const logs: Array<{ url: string; authorization: string }> = [];
  const server = http.createServer((request, response) => {
    const authorization = request.headers.authorization ?? "";
    logs.push({
      url: request.url ?? "",
      authorization: Array.isArray(authorization)
        ? authorization.join(",")
        : authorization,
    });

    if (request.url?.endsWith("/models")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "gpt-4.1-mini" }] }));
      return;
    }

    if (request.url?.endsWith("/chat/completions")) {
      if (options?.failFirstChatAttempt && firstChatAttempt) {
        firstChatAttempt = false;
        request.socket.destroy(new Error("synthetic transient chat failure"));
        return;
      }

      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: "REAL_MOCK_CALL" } }],
          })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
      }, chatDelayMs);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("mock route not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("OpenAI mock server did not bind to a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    logs,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

export async function createDelayedOpenAiHttpServer(chatDelayMs: number): Promise<{
  baseUrl: string;
  logs: Array<{ url: string; authorization: string }>;
  close: () => Promise<void>;
}> {
  return createOpenAiHttpServer({ chatDelayMs });
}

export async function createReadinessNetworkFailureOpenAiHttpServer(): Promise<{
  baseUrl: string;
  logs: Array<{ url: string; authorization: string }>;
  close: () => Promise<void>;
}> {
  const logs: Array<{ url: string; authorization: string }> = [];
  const server = http.createServer((request, response) => {
    const authorization = request.headers.authorization ?? "";
    logs.push({
      url: request.url ?? "",
      authorization: Array.isArray(authorization)
        ? authorization.join(",")
        : authorization,
    });

    if (request.url?.endsWith("/models")) {
      request.socket.destroy(new Error("synthetic readiness network failure"));
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("mock route not expected");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("OpenAI readiness mock server did not bind to a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    logs,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

export function writeOpenAiMockConfig(input: {
  fakeHome: string;
  apiKey: string;
  baseUrl: string;
}): void {
  const configPath = path.join(
    input.fakeHome,
    ".cheers",
    "config.json",
  );
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        providerCredentials: {
          openai: {
            apiKey: input.apiKey,
            baseUrl: input.baseUrl,
            model: "gpt-4.1-mini",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}
