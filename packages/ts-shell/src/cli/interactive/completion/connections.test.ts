import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectionCatalog } from "./connections.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { activateConnection, removeConnection } from "../../../core/commands/connectCommandRuntime.js";
import { scanCommandArgs } from "../../../core/commands/arguments.js";
import { getUserAuthPath, getUserRuntimeConfigPath, readUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
let root: string;
let file: string;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), "cheers-test"); fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, "connection-catalog-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  file = getUserAuthPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function request(text: string) { return catalogRequest({ text, cursor: text.length, revision: 1 }); }
it.each(["/connect use ", "/connect activate ", "/connect logout ", "/connect remove ", "/connect rm ", "/connect use -- -", "/logout "])("offers saved connections for %s", text => {
  expect(request(text)?.kind).toBe("connection");
});
it.each(["/auth use ", "/connect ", "/connect login openai ", "/connect set openai ", "/connect status ", "/connect use first extra", "/connect use --bad ", "/connect use first ", "/logout first extra", "/logout first ", "/logout remove "])("does not query for %s", text => {
  expect(request(text)).toBeUndefined();
});
it("matches labels but accepts exact IDs without revealing credentials or mutating configuration", () => {
  fs.writeFileSync(file, JSON.stringify({ provider: "openai", activeProviderConnectionId: "first", providerConnections: [
    { id: "first", provider: "openai", authType: "api-key", label: "First", apiKey: "synthetic-private-key", baseUrl: "https://private.invalid", accountAuth: { openai: { type: "openai-chatgpt-account", accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: 2_000_000_000_000, accountId: "private-account" } } },
    { id: "second full id", provider: "openai", authType: "api-key", label: "Distinct label", status: "pending", apiKey: "synthetic-other-key" },
  ] }), { mode: 0o600 });
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect(fs.existsSync(getUserRuntimeConfigPath())).toBe(false);
  const items = connectionCatalog();
  expect(items).toEqual([
    { value: "first", label: "First", detail: "first · openai · saved: connected" },
    { value: "second full id", label: "Distinct label", detail: "second full id · openai · saved: pending" },
  ]);
  const edit = catalogSuggestions(request("/connect use Distinct")!, items)[0]!.edit!;
  expect(edit.text).toBe('"second full id" ');
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  expect(fs.existsSync(getUserRuntimeConfigPath())).toBe(false);
  const selector = scanCommandArgs(edit.text)[0]!.value;
  expect(activateConnection([selector])).toContain("Stored active connection: second full id.");
  expect(readUserRuntimeConfigFile().activeProviderConnectionId).toBe("second full id");
  expect(removeConnection([selector])).toContain("Removed provider connection second full id");
  expect(connectionCatalog().map(item => item.value)).toEqual(["first"]);
});
it("distinguishes absent configuration from malformed configuration", () => {
  expect(connectionCatalog()).toEqual([]);
  fs.writeFileSync(file, "{broken");
  expect(() => connectionCatalog()).toThrow();
});
