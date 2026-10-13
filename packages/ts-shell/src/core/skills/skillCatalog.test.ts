import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectTrust } from "../security/projectTrust.js";
import { resolveSkillCatalog } from "./skillCatalog.js";
import { registerCatalogContribution } from '../catalog/contributions.js';
import { execFileSync } from 'node:child_process';

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
    execFileSync('git', ['init', '-q', workspace]);
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

  it('rejects a builtin manifest changed by a child while an extension contribution settles', async () => {
    const file = path.join(workspace, 'named.md');
    const original = '---\nname: one\ndescription: synthetic\n---\noriginal';
    fs.writeFileSync(file, original);
    let changed = false;
    const unregister = registerCatalogContribution({ root: workspace, sessionId: 'capture', tools: [], commands: [], skills: async () => {
      execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])', file, original.replace('original', 'revised!')]);
      changed = true;
      return [];
    } });
    try {
      await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture', skillPaths: [file] })).rejects.toMatchObject({ name: 'ReadChangedError' });
      expect(changed).toBe(true);
    } finally { unregister(); }
  });

  it.each(['project', 'user', 'cli'] as const)('rejects a missing %s skill root created by a child while a contribution settles', async source => {
    const directory = source === 'project' ? path.join(workspace, '.agents', 'skills', 'added')
      : source === 'user' ? path.join(fakeHome, '.cheers', 'skills', 'added') : path.join(workspace, 'named');
    const manifest = path.join(directory, 'SKILL.md');
    const skillPaths = source === 'cli' ? [directory] : undefined;
    let changed = false;
    const unregister = registerCatalogContribution({ root: workspace, sessionId: 'capture', tools: [], commands: [], skills: async () => {
      expect(fs.existsSync(directory)).toBe(false);
      execFileSync(process.execPath, ['-e', 'const fs = require("node:fs"), path = require("node:path"); fs.mkdirSync(path.dirname(process.argv[1]), {recursive:true}); fs.writeFileSync(process.argv[1], "---\\nname: added\\ndescription: synthetic\\n---\\nadded instructions");', manifest]);
      changed = true;
      return [];
    } });
    try {
      await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture', skillPaths })).rejects.toMatchObject({ name: 'ReadChangedError' });
      expect(changed).toBe(true);
      unregister();
      const fresh = await resolveSkillCatalog({ workspaceRoot: workspace, skillPaths });
      expect([...fresh.skills.keys()]).toEqual(['added']);
      expect(fresh.skills.get('added')?.source).toBe(source);
    } finally { unregister(); }
  });

  it('rejects a child replacing a file that initially blocked the project skill root', async () => {
    const parent = path.join(workspace, '.agents');
    const manifest = path.join(parent, 'skills', 'added', 'SKILL.md');
    fs.writeFileSync(parent, 'not a directory');
    let changed = false;
    const unregister = registerCatalogContribution({ root: workspace, sessionId: 'capture', tools: [], commands: [], skills: async () => {
      execFileSync(process.execPath, ['-e', 'const fs = require("node:fs"), path = require("node:path"); fs.unlinkSync(process.argv[1]); fs.mkdirSync(path.dirname(process.argv[2]), {recursive:true}); fs.writeFileSync(process.argv[2], "---\\nname: added\\ndescription: synthetic\\n---\\nadded instructions");', parent, manifest]);
      changed = true;
      return [];
    } });
    try {
      await expect(resolveSkillCatalog({ workspaceRoot: workspace, sessionId: 'capture' })).rejects.toMatchObject({ name: 'ReadChangedError' });
      expect(changed).toBe(true);
      unregister();
      expect([...(await resolveSkillCatalog({ workspaceRoot: workspace })).skills.keys()]).toEqual(['added']);
    } finally { unregister(); }
  });
});
