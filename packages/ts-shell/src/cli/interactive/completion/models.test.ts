import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { modelCatalog } from "./models.js";
import { workflowCatalog } from "./workflows.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { projectTrust } from "../../../core/security/projectTrust.js";
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-model-workflow-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); vi.stubEnv("CHEERS_TEST_ROOT", root);
  fs.mkdirSync(path.join(root, ".cheers"));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function request(text: string) { return catalogRequest({ text, cursor: text.length, revision: 1 }); }
it.each([["/model ", "model"], ["/model openai/", "model"], ["/model SET openai/", "model"], ["/model --global openai/", "model"], ["/model list open", "provider"], ["/model ls --refresh open", "provider"], ["/workflow run ", "workflow"], ["/workflow start f", "workflow"]])("resolves %s", (text, kind) => { expect(request(text)?.kind).toBe(kind); });
it.each(["/model status ", "/model help ", "/model config ", "/model refresh ", "/model use first extra", "/model use --bad ", "/workflow list ", "/workflow status ", "/workflow run first extra"])("ignores %s", text => { expect(request(text)).toBeUndefined(); });
it("reads overlays without creating or refreshing files and retains fixed actions", () => {
  const file = path.join(root, ".cheers", "models.json");
  fs.writeFileSync(file, JSON.stringify({ providers: { openai: { models: [{ id: "fixture-model", contextWindow: 1000 }] } } }));
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect(modelCatalog("model").map(item => item.value)).toContain("openai/fixture-model");
  expect(modelCatalog("provider").map(item => item.value)).toContain("openai");
  expect(modelCatalog("provider").every(item => !item.value.includes("/"))).toBe(true);
  expect(catalogSuggestions(request("/model ")!, []).map(item => item.value)).toContain("status");
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  expect(fs.existsSync(path.join(root, ".cheers", "models-cache.json"))).toBe(false);
});
it("offers only parseable acyclic workflow filenames without running steps", () => {
  const dir = path.join(root, ".agents", "workflows"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "fixture-name.json");
  fs.writeFileSync(file, JSON.stringify({ name: "Display title", steps: [{ id: "one", run: "must-never-run" }] }));
  fs.writeFileSync(path.join(dir, "broken.json"), "{bad");
  fs.writeFileSync(path.join(dir, "cycle.json"), JSON.stringify({ steps: [{ id: "one", run: "unused", needs: ["one"] }] }));
  fs.writeFileSync(path.join(dir, "invalid name.json"), JSON.stringify({ steps: [{ id: "one", run: "must-never-run" }] }));
  const trust = vi.spyOn(projectTrust, "isProjectUntrusted").mockReturnValue(false);
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect(workflowCatalog(root)).toEqual([{ value: "fixture-name", label: "Display title", detail: "1 steps" }]);
  expect(catalogSuggestions(request("/workflow run Display")!, workflowCatalog(root))[0]?.edit?.text).toBe('fixture-name ');
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  expect(fs.readdirSync(dir).sort()).toEqual(["broken.json", "cycle.json", "fixture-name.json", "invalid name.json"]);
  trust.mockReturnValue(true);
  expect(() => workflowCatalog(root)).toThrow("unavailable");
});
