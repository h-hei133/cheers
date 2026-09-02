import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillLoader } from "./skillLoader.js";

describe("skill discovery", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function writeSkill(dir: string, name: string, body: string, extra = ""): void {
    const target = path.join(workspace, ".agents", "skills", dir);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      `---\nname: ${name}\ndescription: what ${name} is for\n${extra}---\n\n${body}\n`,
      "utf8",
    );
  }

  it("finds nothing when no skills are written down", () => {
    expect([...new SkillLoader(workspace).load().keys()]).toEqual([]);
  });

  it("reads a skill's name, description, and instructions", () => {
    writeSkill("review", "review", "Read the diff twice.");

    const skill = new SkillLoader(workspace).load().get("review");
    expect(skill?.description).toBe("what review is for");
    expect(skill?.body).toBe("Read the diff twice.");
    expect(skill?.source).toBe("project");
  });

  it("falls back to the folder name when frontmatter omits one", () => {
    const target = path.join(workspace, ".agents", "skills", "unnamed");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), "just instructions\n", "utf8");

    expect(new SkillLoader(workspace).load().get("unnamed")?.body).toBe("just instructions");
  });

  it("honours a skill that turns itself off", () => {
    writeSkill("off", "off", "never", "enabled: false\n");

    expect(new SkillLoader(workspace).load().has("off")).toBe(false);
  });

  it("sorts by name so the list is stable between runs", () => {
    writeSkill("b", "beta", "b");
    writeSkill("a", "alpha", "a");

    expect([...new SkillLoader(workspace).load().keys()]).toEqual(["alpha", "beta"]);
  });

  it("ignores a folder with no manifest in it", () => {
    fs.mkdirSync(path.join(workspace, ".agents", "skills", "empty"), { recursive: true });

    expect([...new SkillLoader(workspace).load().keys()]).toEqual([]);
  });
});
