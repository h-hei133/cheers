import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectTrust } from "../security/projectTrust.js";
import { resolveSkillCatalog } from "./skillCatalog.js";

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

  it("withholds a project skill from a project marked untrusted", () => {
    // Its body would enter the system prompt, and a repository nobody vouched
    // for does not get to write there. Without this the gate would be a promise
    // the prompt path kept while `/skill:` broke it.
    writeProjectSkill("evil");
    projectTrust.setProjectTrust(workspace, "untrusted");

    expect([...resolveSkillCatalog({ workspaceRoot: workspace }).skills.keys()]).toEqual([]);
  });

  it("still loads a path the user named on the command line", () => {
    // A named file is the user's own instruction, whatever directory it lives
    // in — the trust gate is about what a repository offers, not about what the
    // user pointed at.
    writeProjectSkill("evil");
    projectTrust.setProjectTrust(workspace, "untrusted");
    const named = path.join(workspace, ".agents", "skills", "evil", "SKILL.md");

    const skills = resolveSkillCatalog({
      workspaceRoot: workspace,
      skillPaths: [named],
    }).skills;

    expect([...skills.keys()]).toEqual(["evil"]);
    expect(skills.get("evil")?.source).toBe("cli");
  });

  it("reports a named path it could not load", () => {
    const missing = path.join(workspace, "typo.md");
    const { skills, failures } = resolveSkillCatalog({
      workspaceRoot: workspace,
      skillPaths: [missing],
    });

    expect([...skills.keys()]).toEqual([]);
    expect(failures.map((failure) => failure.filePath)).toEqual([missing]);
  });
});
