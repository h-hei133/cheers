import { createServer, type Server } from "node:http";
import { URL } from "node:url";

/**
 * The loopback server an authorization redirect comes back to.
 *
 * A desktop OAuth client has no public address, so it listens on localhost and
 * advertises that as the redirect URI. Two details matter and both are here
 * because they are what fails in practice: the port is often already taken, and
 * the browser tab needs to be told the login worked or the user sits watching a
 * blank page wondering whether to retry.
 *
 * Nothing here writes to stdout. The terminal belongs to whatever is painting it,
 * and a diagnostic line printed mid-frame lands in the middle of the interface.
 */

export interface CallbackRequest {
  readonly code: string;
  readonly state: string;
}

export interface CallbackServer {
  /** The redirect URI to advertise, which reflects the port actually bound. */
  readonly redirectUri: string;
  /** Resolves with the authorization code, or rejects with why it never came. */
  readonly received: Promise<CallbackRequest>;
  close(): void;
}

/** Ports to try when the preferred one is taken; 0 lets the OS choose. */
const FALLBACK_PORTS = [0];

export interface CallbackOptions {
  readonly path: string;
  readonly port: number;
  readonly expectedState: string;
  readonly timeoutMs: number;
  /** Whether a mismatched state is fatal. A few servers do not echo it at all. */
  readonly requireState?: boolean;
  /** Name used in messages, so a failure says which login it belonged to. */
  readonly label: string;
}

/**
 * Start listening for the redirect.
 *
 * The returned promise settles once: on the callback, on an authorization error
 * carried in the query string, or on the timeout. Every path closes the server,
 * because a listener left bound is a port the next attempt cannot have.
 */
export async function startCallbackServer(options: CallbackOptions): Promise<CallbackServer> {
  const { port, server } = await bind(options.port, options.label);
  const redirectUri = `http://localhost:${port}${options.path}`;
  let settled = false;
  let timer: NodeJS.Timeout | undefined;

  const received = new Promise<CallbackRequest>((resolve, reject) => {
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      // The browser holds the connection open for reuse, and `close` waits for
      // every open socket. Waiting for a keep-alive idle timeout would add seconds
      // to a login that has already finished, so the sockets are dropped: the
      // response is written, and nothing more is coming over them.
      server.closeAllConnections();
      server.close(() => action());
    };

    timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `${options.label}: the browser opened but never came back to ${redirectUri} within ${Math.round(options.timeoutMs / 1000)}s.`,
          ),
        ),
      );
    }, options.timeoutMs);

    server.on("request", (request, response) => {
      const target = new URL(request.url ?? "/", redirectUri);
      if (target.pathname !== options.path) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8", connection: "close" });
        response.end("Not found");
        return;
      }
      const outcome = read(target.searchParams, options);
      if ("error" in outcome) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8", connection: "close" });
        response.end(page("Sign-in failed", outcome.error));
        finish(() => reject(new Error(`${options.label}: ${outcome.error}`)));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", connection: "close" });
      response.end(page("Signed in", "You can close this tab and go back to the terminal."));
      finish(() => resolve(outcome.request));
    });
  });

  return {
    redirectUri,
    received,
    close() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      server.closeAllConnections();
      server.close();
    },
  };
}

/** Bind the preferred port, falling back so an occupied port is not a dead end. */
async function bind(preferred: number, label: string): Promise<{ port: number; server: Server }> {
  let lastError: unknown;
  for (const candidate of [preferred, ...FALLBACK_PORTS]) {
    try {
      return await listen(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label}: could not listen for the sign-in redirect on localhost: ${detail}`);
}

/** One bind attempt, resolved with the port the OS actually gave. */
async function listen(port: number): Promise<{ port: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const onError = (error: unknown): void => {
      server.removeListener("listening", onListening);
      server.close();
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("the callback server bound to an address with no port"));
        return;
      }
      resolve({ port: address.port, server });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "localhost");
  });
}

/** The callback's meaning: a code to redeem, or the reason there is none. */
function read(
  params: URLSearchParams,
  options: CallbackOptions,
): { readonly request: CallbackRequest } | { readonly error: string } {
  const failure = params.get("error");
  if (failure) {
    return { error: params.get("error_description") ?? failure };
  }
  const code = params.get("code");
  if (!code) {
    return { error: "the redirect carried no authorization code" };
  }
  const state = params.get("state") ?? "";
  if (options.requireState !== false && state !== options.expectedState) {
    // A mismatch means the redirect belongs to a different request than the one
    // this process started, which is the case the state parameter exists to catch.
    return { error: "the redirect state did not match the request" };
  }
  return { request: { code, state } };
}

/** The page the browser tab lands on, so the user knows the terminal has it. */
function page(heading: string, detail: string): string {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>",
    heading,
    "</title><style>body{font:16px system-ui;margin:4rem auto;max-width:32rem;color:#222}h1{font-size:1.3rem}</style>",
    "</head><body><h1>",
    heading,
    "</h1><p>",
    detail,
    "</p></body></html>",
  ].join("");
}
