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

  it("finds a skill kept at the repository root when the session starts below it", () => {
    // A repository that ships a skill at its root, with the session opened in a
    // subdirectory. Reading only the working directory loses it silently: the
    // file is there, correctly formed, and the model is never told about it.
    fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });
    writeSkill("root-skill", "root-skill", "root body");
    const nested = path.join(workspace, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });

    expect([...new SkillLoader(nested).load().keys()]).toEqual(["root-skill"]);
  });

  it("lets a skill beside the working directory win over one at the root", () => {
    // The nearer skill was written for this part of the tree, so it is the more
    // specific statement and takes precedence.
    fs.mkdirSync(path.join(workspace, ".git"), { recursive: true });
    const nested = path.join(workspace, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
    writeSkill("shared", "shared", "root body");
    const nearer = path.join(nested, ".agents", "skills", "shared");
    fs.mkdirSync(nearer, { recursive: true });
    fs.writeFileSync(
      path.join(nearer, "SKILL.md"),
      `---\nname: shared\ndescription: the nearer one\n---\n\nnearer body\n`,
      "utf8",
    );

    const loaded = new SkillLoader(nested).load();
    expect(loaded.get("shared")?.description).toBe("the nearer one");
  });

  it("does not read a parent directory that is not part of a project", () => {
    // Without a root marker the chain above the working directory belongs to no
    // project, and reading it would attribute someone else's skills to this one.
    const outer = path.join(workspace, "not-a-project");
    const inner = path.join(outer, "inner");
    fs.mkdirSync(inner, { recursive: true });
    const outside = path.join(outer, ".agents", "skills", "outside-skill");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(
      path.join(outside, "SKILL.md"),
      `---\nname: outside-skill\ndescription: above an unmarked directory\n---\n\nbody\n`,
      "utf8",
    );

    expect([...new SkillLoader(inner).load().keys()]).toEqual([]);
  });

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

  it("flags a name that starts or ends with a hyphen", () => {
    // Inside the character set but outside the shape a name can be called by:
    // `-review` reads as a flag everywhere it is written.
    writeRaw("lead", "name: -review\ndescription: leading hyphen");
    writeRaw("tail", "name: review-\ndescription: trailing hyphen");
    const { diagnostics } = new SkillLoader(workspace).loadDetailed();
    expect(diagnostics.some((d) => d.name === "-review" && /hyphen/.test(d.message))).toBe(true);
    expect(diagnostics.some((d) => d.name === "review-" && /hyphen/.test(d.message))).toBe(true);
  });

  it("flags a name with consecutive hyphens", () => {
    writeRaw("double", "name: code--review\ndescription: doubled hyphen");
    const { diagnostics } = new SkillLoader(workspace).loadDetailed();
    expect(diagnostics.some((d) => d.name === "code--review" && /consecutive/.test(d.message))).toBe(true);
  });
});

describe("named skill paths", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-cli-"));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function writeDiscovered(name: string): void {
    const target = path.join(workspace, ".agents", "skills", name);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      `---\nname: ${name}\ndescription: discovered ${name}\n---\n\ndiscovered body\n`,
      "utf8",
    );
  }

  it("loads a named file directly, whatever its name", () => {
    // The point of naming a file is to load that file; a manifest convention
    // that rejects it would make the flag depend on how the author filed it.
    fs.mkdirSync(path.join(workspace, "loose"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "loose", "review.md"),
      "---\nname: named-review\ndescription: a named skill\n---\n\nnamed body\n",
      "utf8",
    );
    const skills = new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "loose", "review.md")],
    }).load();
    expect(skills.get("named-review")?.source).toBe("cli");
  });

  it("searches a named directory the way a discovered one is searched", () => {
    fs.mkdirSync(path.join(workspace, "bundle"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "bundle", "inner"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "bundle", "inner", "SKILL.md"),
      "---\nname: bundled\ndescription: inside a named directory\n---\n\nbundled body\n",
      "utf8",
    );
    const skills = new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "bundle")],
    }).load();
    expect(skills.has("bundled")).toBe(true);
  });

  it("wins a name a discovered skill shares", () => {
    // The user pointed at the file, and that is the more specific statement
    // about which one this run means.
    writeDiscovered("review");
    fs.mkdirSync(path.join(workspace, "named"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "named", "SKILL.md"),
      "---\nname: review\ndescription: the named one\n---\n\nnamed body\n",
      "utf8",
    );
    const skills = new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "named")],
    }).load();
    expect(skills.get("review")?.source).toBe("cli");
  });

  it("silences every discovered skill when asked, keeping the named ones", () => {
    writeDiscovered("discovered");
    fs.writeFileSync(
      path.join(workspace, "explicit.md"),
      "---\nname: explicit\ndescription: the named one\n---\n\nnamed body\n",
      "utf8",
    );
    const skills = new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "explicit.md")],
      disableDiscovery: true,
    }).load();
    expect(skills.has("discovered")).toBe(false);
    expect([...skills.keys()]).toEqual(["explicit"]);
  });
});
