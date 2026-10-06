import { withConfiguration } from "../../../test-utils/configuration.js";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import { memoryCatalogStore } from "./memory.js";
import { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

let root: string;
const stops: Array<() => void> = [];
beforeEach(() => { root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-store-catalog-")); });
afterEach(() => { stops.splice(0).forEach(stop => stop()); fs.rmSync(root, { recursive: true, force: true }); });

it.each(["grant", "record", "invalidatable"] as const)("observes %s at its owner source, including creation and replacement", async kind => {
  const projectRoot = path.join(root, "project"); fs.mkdirSync(projectRoot);
  const cwd = path.join(root, "different-workspace"); fs.mkdirSync(cwd);
  const policy = new ApprovalTrustPolicy(path.join(root, "custom-policy", "grants.json"));
  const file = kind === "grant" ? policy.sourcePath : memoryCatalogStore(projectRoot).ref.recordsFile!;
  const context = withConfiguration({ cwd, projectRoot, session: { id: "fixture" }, runtimeConfig: {} } as ShellRuntimeContext);
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, [], undefined, policy);
  const changed = vi.fn(); const stop = load.observe(kind, undefined, changed);
  if (stop) stops.push(stop);
  const values = async () => (await load(kind, new AbortController().signal)).map(item => item.value);
  expect(await values()).toEqual([]); expect(fs.existsSync(path.dirname(file))).toBe(false);
  const payload = (name: string) => kind === "grant" ? JSON.stringify({ grants: [{ projectRoot, toolName: "bash", operation: "spawn", scopeKey: name, scopeLabel: name, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }] })
    : JSON.stringify({ id: name, version: 1, createdAt: "2026-01-01T00:00:00Z", candidateId: "fixture", candidateKind: "project-fact", retentionClass: "project-scoped-candidate", approvedAt: "2026-01-01T00:00:00Z", approvedBySourceCommand: "/memory", memoryText: "Private fixture body", evidence: ["fixture"], source: "compact-packet", routeReferences: [], safety: "safe", redactions: [] }) + "\n";
  const value = (name: string) => kind === "grant" ? `${projectRoot}|${name}` : name;
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, payload("first"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toEqual([value("first")]);
  changed.mockClear(); const temporary = path.join(root, "replacement");
  fs.writeFileSync(temporary, payload("replacement")); fs.renameSync(temporary, file);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect(await values()).toEqual([value("replacement")]);
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  changed.mockClear(); fs.unlinkSync(file);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(await values()).toEqual([]);
  stop?.(); changed.mockClear(); fs.writeFileSync(file, payload("after-stop"));
  await new Promise(resolve => setTimeout(resolve, 100)); expect(changed).not.toHaveBeenCalled();
});
