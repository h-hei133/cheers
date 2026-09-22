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

  it("finds skills grouped into subdirectories, not only at the top level", () => {
    // The layout a real skill collection uses. Reading one level deep loses
    // every grouped skill, and the model cannot miss what it was never told.
    writeSkill("top-skill", "top-skill", "top body");
    writeSkill("group/nested-skill", "nested-skill", "nested body");
    writeSkill("group/deeper/deep-skill", "deep-skill", "deep body");

    expect([...new SkillLoader(workspace).load().keys()].sort()).toEqual([
      "deep-skill",
      "nested-skill",
      "top-skill",
    ]);
  });

  it("treats a directory holding a skill manifest as that skill, not a container", () => {
    // The manifest's own subdirectories belong to the skill above it.
    writeSkill("outer", "outer-skill", "outer body");
    const nested = path.join(workspace, ".agents", "skills", "outer", "inner");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "SKILL.md"),
      "---\nname: inner-skill\ndescription: nested inside another skill\n---\n\ninner body\n",
      "utf8",
    );

    const loaded = new SkillLoader(workspace).load();
    expect(loaded.has("outer-skill")).toBe(true);
    expect(loaded.has("inner-skill")).toBe(false);
  });

  it("skips dependency and dot directories", () => {
    writeSkill("real-skill", "real-skill", "body");
    writeSkill("node_modules/dep-skill", "dep-skill", "someone else's");
    writeSkill(".hidden/hidden-skill", "hidden-skill", "tooling state");

    expect([...new SkillLoader(workspace).load().keys()]).toEqual(["real-skill"]);
  });

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

describe("name collisions", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-collide-"));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("reports both files when two claim the same name", () => {
    // The losing file is otherwise invisible: the winner appears and the other
    // never does, so nobody learns that editing it has no effect.
    const dir = path.join(workspace, ".agents", "skills");
    for (const group of ["one", "two"]) {
      const target = path.join(dir, group);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, "SKILL.md"),
        `---\nname: shared\ndescription: from ${group}\n---\n\nbody\n`,
        "utf8",
      );
    }

    const { skills, collisions } = new SkillLoader(workspace).loadDetailed();

    expect(skills.size).toBe(1);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.name).toBe("shared");
    expect(collisions[0]?.winnerPath).toContain("one");
    expect(collisions[0]?.loserPath).toContain("two");
  });

  it("reports nothing when every name is unique", () => {
    const dir = path.join(workspace, ".agents", "skills");
    for (const name of ["alpha", "beta"]) {
      const target = path.join(dir, name);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, "SKILL.md"),
        `---\nname: ${name}\ndescription: what ${name} is for\n---\n\nbody\n`,
        "utf8",
      );
    }

    expect(new SkillLoader(workspace).loadDetailed().collisions).toEqual([]);
  });
});

describe("skill diagnostics", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-diag-"));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /** Write a skill with explicit frontmatter, bypassing the name helper. */
  function writeRaw(dir: string, frontmatter: string): void {
    const target = path.join(workspace, ".agents", "skills", dir);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `---\n${frontmatter}\n---\n\nbody\n`, "utf8");
  }

  it("reports a skill that has no description instead of dropping it silently", () => {
    // The skill cannot be matched by the model without a description, so it never
    // appears — and with no diagnostic the author has nothing to go on.
    writeRaw("mute", "name: mute");

    const { diagnostics } = new SkillLoader(workspace).loadDetailed();

    expect(diagnostics.some((d) => d.name === "mute" && /description/.test(d.message))).toBe(true);
  });

  it("keeps loading a skill whose name is not in the expected format", () => {
    // A bad name is a blemish, not an unusable skill: it is still loadable by
    // name, so refusing it would lose working instructions over cosmetics.
    writeRaw("odd", "name: Not A Valid Name\ndescription: still useful");

    const { skills, diagnostics } = new SkillLoader(workspace).loadDetailed();

    expect(skills.has("Not A Valid Name")).toBe(true);
    expect(diagnostics.some((d) => /name/i.test(d.message))).toBe(true);
  });

  it("reports a name that is too long", () => {
    writeRaw("long", `name: ${"a".repeat(65)}\ndescription: too long a name`);

    const { diagnostics } = new SkillLoader(workspace).loadDetailed();

    expect(diagnostics.some((d) => /64/.test(d.message))).toBe(true);
  });

  it("says nothing about a skill that is well formed", () => {
    writeRaw("fine", "name: fine-skill\ndescription: perfectly ordinary");

    const { diagnostics } = new SkillLoader(workspace).loadDetailed();

    expect(diagnostics).toEqual([]);
  });
});
