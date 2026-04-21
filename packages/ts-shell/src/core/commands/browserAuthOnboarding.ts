import http from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { spawn } from "node:child_process";

export interface BrowserAuthCaptureResult {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
}

export interface BrowserAuthFlowOptions {
  readonly provider: string;
  readonly presetLabel: string;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
  readonly timeoutMs?: number;
  readonly openBrowser?: (url: string) => Promise<void> | void;
  readonly onAuthorizeUrl?: (url: string) => void;
}

export async function captureApiKeyViaBrowser(
  options: BrowserAuthFlowOptions,
): Promise<BrowserAuthCaptureResult> {
  const state = randomBytes(16).toString("hex");
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 180_000);

  return new Promise<BrowserAuthCaptureResult>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (req.method === "GET" && requestUrl.pathname === "/") {
        const html = renderOnboardingForm({
          state,
          provider: options.provider,
          presetLabel: options.presetLabel,
          baseUrl: options.defaultBaseUrl,
          model: options.defaultModel,
        });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/submit") {
        const body = await readRequestBody(req);
        const params = new URLSearchParams(body);
        const incomingState = params.get("state")?.trim();
        if (!incomingState || incomingState !== state) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end(
            "Invalid state. Retry /connect login <provider> --browser for browser-assisted local key capture.",
          );
          return;
        }

        const apiKey = params.get("apiKey")?.trim();
        const baseUrl = params.get("baseUrl")?.trim();
        const model = params.get("model")?.trim();
        if (!apiKey) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
          res.end("API key is required.");
          return;
        }

        clearTimeout(timeoutId);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderSuccessPage());
        server.close();
        resolve({
          apiKey,
          ...(baseUrl ? { baseUrl } : {}),
          ...(model ? { model } : {}),
        });
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    });

    server.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    const timeoutId = setTimeout(() => {
      server.close();
      reject(new Error("Browser auth timed out before callback completed."));
    }, timeoutMs);

    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        clearTimeout(timeoutId);
        server.close();
        reject(new Error("Failed to bind local browser auth callback server."));
        return;
      }

      const authUrl = `http://127.0.0.1:${address.port}/?state=${encodeURIComponent(state)}`;
      try {
        options.onAuthorizeUrl?.(authUrl);
        if (!options.openBrowser) {
          process.stdout.write(
            [
              "",
              `Browser-assisted local capture URL: ${authUrl}`,
              "If your browser does not open automatically, copy this URL into a browser manually.",
              "",
            ].join("\n"),
          );
        }
        if (options.openBrowser) {
          await options.openBrowser(authUrl);
        } else {
          openSystemBrowser(authUrl);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        server.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

function openSystemBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [url], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  spawn("xdg-open", [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

async function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function renderOnboardingForm(input: {
  readonly state: string;
  readonly provider: string;
  readonly presetLabel: string;
  readonly baseUrl?: string;
  readonly model?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Provider Connect</title></head>
<body style="font-family: sans-serif; margin: 24px; max-width: 720px;">
  <h2>Connect ${escapeHtml(input.presetLabel)}</h2>
  <p>Complete local credential capture for <code>${escapeHtml(input.provider)}</code>. This is not provider account OAuth.</p>
  <form method="POST" action="/submit">
    <input type="hidden" name="state" value="${escapeHtml(input.state)}" />
    <p><label>API Key<br/><input type="password" name="apiKey" style="width: 100%;" required /></label></p>
    <p><label>Base URL<br/><input type="text" name="baseUrl" value="${escapeHtml(input.baseUrl ?? "")}" style="width: 100%;" /></label></p>
    <p><label>Model<br/><input type="text" name="model" value="${escapeHtml(input.model ?? "")}" style="width: 100%;" /></label></p>
    <p><button type="submit">Complete Connection</button></p>
  </form>
</body>
</html>`;
}

function renderSuccessPage(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Connected</title></head>
<body style="font-family: sans-serif; margin: 24px;">
  <h2>Connection completed</h2>
  <p>You can close this tab and return to the terminal.</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
