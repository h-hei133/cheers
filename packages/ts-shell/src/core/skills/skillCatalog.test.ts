import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectTrust } from "../security/projectTrust.js";
import { resolveSkillCatalog } from "./skillCatalog.js";
import { registerCatalogContribution } from '../catalog/contributions.js';

/**
 * The one rule every skill reader resolves through.
 *
 * The prompt path, `/skill`, and `/skill:` all ask this for the same answer, so
 * the rule is asserted once here rather than three times through three callers.
 */
describe("resolveSkillCatalog", () => {
  let workspace = "";
  let fakeHome = "";
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-home-"));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-ws-"));
  });

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function writeProjectSkill(name: string): void {
    const dir = path.join(workspace, ".agents", "skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: from the project\n---\n\nPROJECT BODY\n`,
      "utf8",
    );
  }

  it("withholds a project skill from a project marked untrusted", async () => {
    // Its body would enter the system prompt, and a repository nobody vouched
    // for does not get to write there. Without this the gate would be a promise
    // the prompt path kept while `/skill:` broke it.
    writeProjectSkill("evil");
    projectTrust.setProjectTrust(workspace, "untrusted");

    expect([...(await resolveSkillCatalog({ workspaceRoot: workspace })).skills.keys()]).toEqual([]);
  });

  it("still loads a path the user named on the command line", async () => {
    // A named file is the user's own instruction, whatever directory it lives
    // in — the trust gate is about what a repository offers, not about what the
    // user pointed at.
    writeProjectSkill("evil");
    projectTrust.setProjectTrust(workspace, "untrusted");
    const named = path.join(workspace, ".agents", "skills", "evil", "SKILL.md");

    const skills = (await resolveSkillCatalog({
      workspaceRoot: workspace,
      skillPaths: [named],
    })).skills;

    expect([...skills.keys()]).toEqual(["evil"]);
    expect(skills.get("evil")?.source).toBe("cli");
  });

  it("reports a named path it could not load", async () => {
    const missing = path.join(workspace, "typo.md");
    const { skills, failures } = (await resolveSkillCatalog({
      workspaceRoot: workspace,
      skillPaths: [missing],
    }));

    expect([...skills.keys()]).toEqual([]);
    expect(failures.map((failure) => failure.filePath)).toEqual([missing]);
  });

  it('withholds a contribution unregistered during asynchronous skill capture', async () => {
    let release!: () => void; let began!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { began = resolve; });
    const unregister = registerCatalogContribution({ root: workspace, sessionId: 'capture', tools: [], commands: [], skills: async () => {
      began(); await held;
      return [{ name: 'revoked', description: 'revoked', body: 'private instructions', source: 'extension', filePath: 'SKILL.md', disableModelInvocation: false, unhonouredFields: [] }];
    } });
    const pending = resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' });
    try { await started; unregister(); release(); expect((await pending).skills.has('revoked')).toBe(false); }
    finally { unregister(); release(); }
  });

  it('rechecks an earlier contribution after a later asynchronous capture', async () => {
    let release!: () => void; let began!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { began = resolve; });
    const first = registerCatalogContribution({ root: workspace, sessionId: 'capture', tools: [], commands: [], skills: () => [
      { name: 'earlier', description: 'revoked', body: 'private instructions', source: 'extension', filePath: 'SKILL.md', disableModelInvocation: false, unhonouredFields: [] },
    ] });
    const second = registerCatalogContribution({ root: workspace, sessionId: 'capture', tools: [], commands: [], skills: async () => { began(); await held; return []; } });
    const pending = resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' });
    try { await started; first(); release(); expect((await pending).skills.has('earlier')).toBe(false); }
    finally { first(); second(); release(); }
  });
});
