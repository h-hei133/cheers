import path from "node:path";
import { describe, expect, it } from "vitest";
import { CoreMcpClient } from "./client.js";
import { classifyUnknownMcpFailure } from "./errorTaxonomy.js";

/**
 * What the client says about a transport it cannot use.
 *
 * The configuration type names more transports than this build implements. The
 * danger is not the gap itself — it is answering from the gap with something
 * that looks like work: a call that reports success without leaving the
 * process, or a connection state that marks the server executable. Both were
 * true here, and both are invisible to the caller, which is what makes them
 * worth pinning.
 */

function client(transport: "http" | "ws" | "sdk"): CoreMcpClient {
  return new CoreMcpClient("remote", {
    transport,
    url: "https://mcp.example.test",
    scope: "user",
  });
}

describe("a server on a transport this build does not implement", () => {
  it("fails at connect instead of reporting a connection", async () => {
    // `connected` is not cosmetic: the gateway reads it to decide whether the
    // server is executable, so a wrong answer here reaches the user as
    // "executable=yes" for a server that cannot run anything.
    for (const transport of ["http", "ws", "sdk"] as const) {
      await expect(client(transport).connect()).resolves.toMatchObject({
        type: "failed",
        name: "remote",
      });
    }
  });

  it("names the transport and what is supported", async () => {
    // "not implemented" and "unknown transport" call for different fixes, so
    // the message has to say which one this is.
    const state = await client("http").connect();
    expect(state.type === "failed" && state.error).toContain("http");
    expect(state.type === "failed" && state.error).toContain("stdio");
  });

  it("raises a classified failure rather than returning success", async () => {
    // The failure that matters most: a tool call answering "executed
    // successfully" when nothing was sent. A caller cannot detect it, and the
    // model would report work that never happened.
    await expect(client("http").invokeTool("do_thing", { a: 1 })).rejects.toThrow(
      /does not implement/,
    );
  });

  it("classifies the refusal as a configuration problem", async () => {
    // The fix is in the user's file, so the failure belongs on the user-config
    // plane rather than looking like a server outage.
    const error = await client("http")
      .invokeTool("do_thing", {})
      .then(() => undefined)
      .catch((caught: unknown) => caught);
    expect(classifyUnknownMcpFailure(error)).toMatchObject({
      failureClass: "config",
      failurePlane: "user-config",
    });
  });

  it("still connects a transport it does implement", async () => {
    // The gate must not become a blanket refusal: stdio is the one that works.
    const client = new CoreMcpClient("local", {
      transport: "stdio",
      command: process.execPath,
      args: [path.resolve("src/core/mcp/fixtures/mockMcpServer.mjs")],
      scope: "user",
    });
    try {
      await expect(client.connect()).resolves.toMatchObject({ type: "connected" });
    } finally { await client.close(); }
  });

  it("still reports a missing command as its own failure", async () => {
    // The field check keeps its own message: a stdio server with no command is
    // a different mistake from a transport we do not have.
    const client = new CoreMcpClient("local", { transport: "stdio", scope: "user" });
    await expect(client.connect()).resolves.toMatchObject({
      type: "failed",
      error: "Missing stdio command",
    });
  });
});
