import { afterEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CoreMcpClient } from "./client.js";

afterEach(() => vi.restoreAllMocks());

it.each(["admission", "cancellation"])("does not publish a catalog after %s expires during listing", async kind => {
  let valid = true;
  const controller = new AbortController();
  const published: unknown[] = [];
  vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
  vi.spyOn(Client.prototype, "getServerCapabilities").mockReturnValue({ tools: {} });
  vi.spyOn(Client.prototype, "request").mockImplementation(async () => {
    if (kind === "admission") valid = false;
    else controller.abort();
    return { tools: [{ name: "late", inputSchema: { type: "object" } }] };
  });
  const client = new CoreMcpClient("local", { transport: "stdio", command: process.execPath, scope: "user" },
    process.cwd(), 1000, () => published.push(client.peekTools()));
  try {
    await expect(client.listTools(() => valid ? undefined : "expired owner", controller.signal)).rejects.toThrow();
    expect(client.peekTools()).toBeUndefined();
    expect(published.every(value => value === undefined)).toBe(true);
  } finally { await client.close(); }
});

it.each(["admission", "cancellation"])("does not publish a connection after %s expires during handshake", async kind => {
  let valid = true;
  const controller = new AbortController();
  vi.spyOn(Client.prototype, "connect").mockImplementation(async () => {
    if (kind === "admission") valid = false;
    else controller.abort();
  });
  const client = new CoreMcpClient("local", { transport: "stdio", command: process.execPath, scope: "user" });
  try {
    const connecting = client.connect(() => valid ? undefined : "expired owner", controller.signal);
    if (kind === "cancellation") await expect(connecting).rejects.toThrow();
    else await expect(connecting).resolves.toMatchObject({ type: "failed", error: "expired owner" });
    expect(client.peekTools()).toBeUndefined();
  } finally { await client.close(); }
});

it.each(["admission", "cancellation"])("does not publish an empty catalog after %s expires while acquiring the client", async kind => {
  let valid = true;
  const controller = new AbortController();
  const published: unknown[] = [];
  vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
  vi.spyOn(Client.prototype, "getServerCapabilities").mockReturnValue({});
  const client = new CoreMcpClient("local", { transport: "stdio", command: process.execPath, scope: "user" },
    process.cwd(), 1000, () => published.push(client.peekTools()));
  // Expire in the await boundary after the actual requireClient has admitted its result.
  const dependency = client as unknown as { requireClient(): Promise<Client> };
  const acquire = dependency.requireClient.bind(client);
  vi.spyOn(dependency, "requireClient").mockImplementation(async () => {
    const ready = await acquire();
    if (kind === "admission") valid = false;
    else controller.abort();
    return ready;
  });
  try {
    await expect(client.listTools(() => valid ? undefined : "expired owner", controller.signal)).rejects.toThrow();
    expect(client.peekTools()).toBeUndefined();
    expect(published.every(value => value === undefined)).toBe(true);
  } finally { await client.close(); }
});

it("applies one deadline across every tools/list page instead of resetting it per cursor", async () => {
  vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
  vi.spyOn(Client.prototype, "getServerCapabilities").mockReturnValue({ tools: {} });
  vi.spyOn(Client.prototype, "request").mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { tools: [], nextCursor: `cursor-${Date.now()}` };
  });
  const client = new CoreMcpClient("local", { transport: "stdio", command: process.execPath, scope: "user" },
    process.cwd(), 50);
  try {
    await client.connect();
    await expect(client.listTools()).rejects.toMatchObject({ failureClass: "timeout-cancelled" });
    expect(client.peekTools()).toBeUndefined();
  } finally { await client.close(); }
});

it("refuses a tools/list response that exceeds the cumulative catalog byte limit", async () => {
  vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
  vi.spyOn(Client.prototype, "getServerCapabilities").mockReturnValue({ tools: {} });
  vi.spyOn(Client.prototype, "request").mockResolvedValue({
    tools: [{ name: "large", description: "x".repeat(4 * 1024 * 1024), inputSchema: { type: "object" } }],
  });
  const client = new CoreMcpClient("local", { transport: "stdio", command: process.execPath, scope: "user" });
  try {
    await client.connect();
    await expect(client.listTools()).rejects.toThrow(/size limit/);
    expect(client.peekTools()).toBeUndefined();
  } finally { await client.close(); }
});
