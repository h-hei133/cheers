import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { EscalationPrompt } from "../../../core/shell/approval/contract.js";
import { grantCatalog } from "./grants.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { scanCommandArgs } from "../../../core/commands/arguments.js";
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-grant-catalog-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function request(text: string) { return catalogRequest({ text, cursor: text.length, revision: 1 }); }
function prompt(target: string): EscalationPrompt {
  return { id: "fixture", title: "fixture", message: "fixture", context: { toolName: "bash", operation: "spawn", target }, options: [], defaultOption: "deny", recommendedAction: "allow once", severity: "low" };
}
it.each(["/permissions revoke ", "/permissions remove b", "/permissions revoke -- "])("offers grants for %s", text => {
  expect(request(text)?.kind).toBe("grant");
});
it.each(["/permissions ", "/permissions list ", "/permissions reset ", "/permissions revoke first extra", "/permissions revoke --bad "])("does not query for %s", text => {
  expect(request(text)).toBeUndefined();
});
it("reads only current project grants and inserts a stable selector without revoking", () => {
  const file = path.join(root, "grants.json");
  const policy = new ApprovalTrustPolicy(file);
  policy.rememberAllowAlways(prompt("node --version"), root);
  policy.rememberAllowAlways(prompt("other --version"), path.join(root, "other"));
  const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  const items = grantCatalog(root, policy);
  expect(items).toHaveLength(1);
  expect(items[0]?.value).toBe(policy.listGrants(root)[0]?.key);
  const edit = catalogSuggestions(request("/permissions revoke bash")!, items)[0]?.edit;
  expect(edit).toBeDefined();
  const selector = scanCommandArgs(edit!.text)[0]!.value;
  expect(selector).toBe(items[0]!.value);
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  policy.rememberAllowAlways(prompt("newer --version"), root);
  expect(policy.revokeGrant(root, selector).removedGrant?.scopeLabel).toBe("bash/spawn(node --version)");
  expect(policy.listGrants(root)).toHaveLength(1);
  expect(policy.listGrants(path.join(root, "other"))).toHaveLength(1);
});
