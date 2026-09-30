import http from "node:http";

export interface BrowserControlledNetworkServer {
  readonly origin: string;
  readonly runId: string;
  readonly requests: readonly string[];
  close(): Promise<void>;
}

export async function createBrowserControlledNetworkServer(input: {
  readonly runId?: string;
} = {}): Promise<BrowserControlledNetworkServer> {
  const runId = input.runId ?? "controlled-network-harness";
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    const url = request.url ?? "/";
    requests.push(url);
    if (url.startsWith("/redirect-public")) {
      response.writeHead(302, { location: "https://example.com/" });
      response.end();
      return;
    }
    if (url.startsWith("/slow")) {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><title>Slow ${runId}</title><main>slow controlled response</main>`);
      }, 150);
      return;
    }
    if (url.startsWith("/extract")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-route-run-id": runId });
      response.end(`<!doctype html><title>Extract ${runId}</title><main>controlled extraction summary</main>`);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-route-run-id": runId });
    response.end(`<!doctype html><title>Controlled ${runId}</title><main>controlled observe summary</main>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Controlled network server failed to bind loopback port.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    runId,
    get requests() {
      return requests;
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
