import { execFileSync } from "node:child_process";
import fs, { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import which from "which";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillLoader } from "./skillLoader.js";

describe("skill discovery", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
    execFileSync('git', ['init', '-q', workspace]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("finds a skill kept at the repository root when the session starts below it", async () => {
    // A repository that ships a skill at its root, with the session opened in a
    // subdirectory. Reading only the working directory loses it silently: the
    // file is there, correctly formed, and the model is never told about it.
    execFileSync('git', ['init', '-q', workspace]);
    writeSkill("root-skill", "root-skill", "root body");
    const nested = path.join(workspace, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });

    expect([...(await new SkillLoader(nested).load()).keys()]).toEqual(["root-skill"]);
  });

  it("lets a skill beside the working directory win over one at the root", async () => {
    // The nearer skill was written for this part of the tree, so it is the more
    // specific statement and takes precedence.
    execFileSync('git', ['init', '-q', workspace]);
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

    const loaded = (await new SkillLoader(nested).load());
    expect(loaded.get("shared")?.description).toBe("the nearer one");
  });

  it("does not read a parent directory that is not part of a project", async () => {
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

    // Keep this no-project scenario independent of a TMPDIR inside a repository.
    const exists = fs.existsSync;
    const marker = vi.spyOn(fs, "existsSync").mockImplementation(file =>
      path.basename(String(file)) === ".git" ? false : exists(file));
    try {
      expect([...(await new SkillLoader(inner).load()).keys()]).toEqual([]);
    } finally {
      marker.mockRestore();
    }
  });

  it("finds skills grouped into subdirectories, not only at the top level", async () => {
    // The layout a real skill collection uses. Reading one level deep loses
    // every grouped skill, and the model cannot miss what it was never told.
    writeSkill("top-skill", "top-skill", "top body");
    writeSkill("group/nested-skill", "nested-skill", "nested body");
    writeSkill("group/deeper/deep-skill", "deep-skill", "deep body");

    expect([...(await new SkillLoader(workspace).load()).keys()].sort()).toEqual([
      "deep-skill",
      "nested-skill",
      "top-skill",
    ]);
  });

  it("treats a directory holding a skill manifest as that skill, not a container", async () => {
    // The manifest's own subdirectories belong to the skill above it.
    writeSkill("outer", "outer-skill", "outer body");
    const nested = path.join(workspace, ".agents", "skills", "outer", "inner");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "SKILL.md"),
      "---\nname: inner-skill\ndescription: nested inside another skill\n---\n\ninner body\n",
      "utf8",
    );

    const loaded = (await new SkillLoader(workspace).load());
    expect(loaded.has("outer-skill")).toBe(true);
    expect(loaded.has("inner-skill")).toBe(false);
  });

  it("skips dependency and dot directories", async () => {
    writeSkill("real-skill", "real-skill", "body");
    writeSkill("node_modules/dep-skill", "dep-skill", "someone else's");
    writeSkill(".hidden/hidden-skill", "hidden-skill", "tooling state");

    expect([...(await new SkillLoader(workspace).load()).keys()]).toEqual(["real-skill"]);
  });

  it("finds nothing when no skills are written down", async () => {
    expect([...(await new SkillLoader(workspace).load()).keys()]).toEqual([]);
  });

  it('rejects incomplete discovery at traversal or manifest limits', async () => {
    writeSkill('one', 'one', 'body');
    writeSkill('two', 'two', 'body');
    await expect(new SkillLoader(workspace, { limits: { entries: 1 } }).load()).rejects.toThrow(/limit/);
    writeSkill('large', 'large', 'x'.repeat(512 * 1024));
    await expect(new SkillLoader(workspace).load()).rejects.toThrow(/no complete catalog/);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(new SkillLoader(workspace, { abortSignal: cancelled.signal }).load()).rejects.toThrow();
  });

  it('reads zero manifest bytes when its path is replaced after opening and closes the handle', async () => {
    writeSkill('one', 'one', 'body');
    const file = path.join(workspace, '.agents', 'skills', 'one', 'SKILL.md');
    const outside = path.join(workspace, 'outside.md');
    fs.writeFileSync(outside, 'PRIVATE_MANIFEST');
    const open = fsp.open;
    let captured: Awaited<ReturnType<typeof open>> | undefined;
    let read: ReturnType<typeof vi.spyOn> | undefined;
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === file) {
        captured = handle; read = vi.spyOn(handle, 'read');
        fs.renameSync(file, `${file}.old`); fs.symlinkSync(outside, file);
      }
      return handle;
    });
    await expect(new SkillLoader(workspace).load()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(captured).toBeDefined(); expect(read).not.toHaveBeenCalled(); expect(captured!.fd).toBe(-1);
  });

  it('rejects a complete catalog when a child changes a manifest at its final snapshot stat', async () => {
    const file = path.join(workspace, 'named.md');
    const original = '---\nname: one\ndescription: synthetic\n---\noriginal';
    fs.writeFileSync(file, original);
    const open = fsp.open;
    let captured: Awaited<ReturnType<typeof open>> | undefined;
    let statCalls = 0;
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === file) {
        captured = handle;
        const stat = handle.stat.bind(handle);
        vi.spyOn(handle, 'stat').mockImplementation(async (...options: any[]) => {
          if (++statCalls === 3) execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])', file, original.replace('original', 'revised!')]);
          return stat(...options as [any]);
        });
      }
      return handle;
    });
    await expect(new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [file] }).loadDetailed()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(statCalls).toBe(3);
    expect(captured?.fd).toBe(-1);
  });

  it('rejects earlier manifest changes while loading a later manifest', async () => {
    const first = path.join(workspace, 'first.md');
    const second = path.join(workspace, 'second.md');
    const original = '---\nname: first\ndescription: synthetic\n---\noriginal';
    fs.writeFileSync(first, original);
    fs.writeFileSync(second, '---\nname: second\ndescription: synthetic\n---\nsecond');
    const open = fsp.open;
    const handles: Awaited<ReturnType<typeof open>>[] = [];
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args); handles.push(handle);
      if (args[0] === second) execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])', first, original.replace('original', 'revised!')]);
      return handle;
    });
    await expect(new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [first, second] }).loadDetailed()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(handles).toHaveLength(2);
    expect(handles.every(handle => handle.fd === -1)).toBe(true);
  });

  it('rejects a catalog when a child adds a manifest after its directory was enumerated', async () => {
    const directory = path.join(workspace, 'selected');
    fs.mkdirSync(directory);
    const first = path.join(directory, 'first.md');
    fs.writeFileSync(first, '---\nname: first\ndescription: synthetic\n---\nfirst');
    let changed = false;
    const open = fsp.open;
    const handles: Awaited<ReturnType<typeof open>>[] = [];
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args); handles.push(handle);
      if (args[0] === first && !changed) {
        execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])',
          path.join(directory, 'added.md'), '---\nname: added\ndescription: synthetic\n---\nadded']);
        changed = true;
      }
      return handle;
    });
    const loader = new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [directory] });
    await expect(loader.loadDetailed()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(changed).toBe(true);
    expect(handles.every(handle => handle.fd === -1)).toBe(true);
  });

  it('does not replace an earlier captured revision when the same manifest is selected again', async () => {
    const file = path.join(workspace, 'named.md');
    const original = '---\nname: one\ndescription: synthetic\n---\noriginal';
    fs.writeFileSync(file, original);
    let observed = 0;
    const open = vi.spyOn(fsp, 'open');
    const loader = new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [file, file], onSource: target => {
      if (target === file && ++observed === 2) execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])', file, original.replace('original', 'revised!')]);
    } });
    await expect(loader.loadDetailed()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(observed).toBe(2);
    expect(open.mock.calls.filter(([target]) => target === file)).toHaveLength(1);
  });

  it.each(['native', 'fallback'] as const)('rejects captured %s ignore changes after the query returns', async mode => {
    writeSkill('one', 'one', 'PRIVATE_SKILL_BODY');
    const rules = path.join(workspace, '.gitignore');
    const manifest = path.join(workspace, '.agents/skills/one/SKILL.md');
    fs.writeFileSync(rules, '');
    if (mode === 'fallback') {
      const sync = which.sync;
      vi.spyOn(which, 'sync').mockImplementation(((command: string, options: any) =>
        command === 'git' ? null : sync(command, options)) as typeof sync);
    }
    expect((await new SkillLoader(workspace).load()).has('one')).toBe(true);
    const open = fsp.open;
    const handles: Awaited<ReturnType<typeof open>>[] = [];
    let source: Awaited<ReturnType<typeof open>> | undefined;
    let changed = false;
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args); handles.push(handle);
      if (args[0] === rules) source = handle;
      if (args[0] === manifest && !changed) {
        expect(source?.fd).toBe(-1);
        execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], ".agents/skills/one/\\n")', rules]);
        changed = true;
      }
      return handle;
    });
    await expect(new SkillLoader(workspace).loadDetailed()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(changed).toBe(true);
    expect(handles.every(handle => handle.fd === -1)).toBe(true);
  });

  it.each(['config', 'index', 'alias'] as const)('rejects captured Git %s changes before publishing a skill catalog', async kind => {
    writeSkill('one', 'one', 'PRIVATE_SKILL_BODY');
    const relative = '.agents/skills/one/SKILL.md';
    const manifest = path.join(workspace, relative);
    const rules = path.join(workspace, 'excluded.rules');
    fs.writeFileSync(rules, '.agents/skills/one/\n');
    let source = path.join(workspace, '.git', kind === 'index' ? 'index' : 'config');
    let script = 'require("node:fs").appendFileSync(process.argv[1], "\\n[core]\\nexcludesFile=" + process.argv[2] + "\\n")';
    let arguments_ = [source, rules];
    if (kind === 'index') {
      fs.writeFileSync(path.join(workspace, '.gitignore'), '.agents/skills/one/\n');
      execFileSync('git', ['-C', workspace, 'add', '-f', relative]);
      script = 'require("node:child_process").execFileSync("git", ["-C", process.argv[1], "update-index", "--force-remove", process.argv[2]])';
      arguments_ = [workspace, relative];
    } else if (kind === 'alias') {
      source = path.join(workspace, 'initial.rules'); fs.writeFileSync(source, '');
      const alias = path.join(workspace, 'rules-link'); fs.symlinkSync(source, alias);
      execFileSync('git', ['-C', workspace, 'config', 'core.excludesFile', alias]);
      script = 'const fs=require("node:fs"); fs.unlinkSync(process.argv[1]); fs.symlinkSync(process.argv[2], process.argv[1])';
      arguments_ = [alias, rules];
    }
    expect((await new SkillLoader(workspace).load()).has('one')).toBe(true);
    const open = fsp.open;
    const handles: Awaited<ReturnType<typeof open>>[] = [];
    let captured: Awaited<ReturnType<typeof open>> | undefined;
    let changed = false;
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args); handles.push(handle);
      if (args[0] === source) captured = handle;
      if (args[0] === manifest && !changed) {
        expect(captured?.fd).toBe(-1);
        execFileSync(process.execPath, ['-e', script, ...arguments_]);
        changed = true;
      }
      return handle;
    });
    await expect(new SkillLoader(workspace).loadDetailed()).rejects.toMatchObject({ name: 'ReadChangedError' });
    expect(changed).toBe(true);
    expect(handles.every(handle => handle.fd === -1)).toBe(true);
  });

  it('rejects a manifest that grows beyond the byte budget after its size precheck', async () => {
    const file = path.join(workspace, 'named.md'); fs.writeFileSync(file, 'small');
    const open = fsp.open; let captured: Awaited<ReturnType<typeof open>> | undefined; let read: ReturnType<typeof vi.spyOn> | undefined;
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (args[0] === file) { captured = handle; read = vi.spyOn(handle, 'read'); fs.appendFileSync(file, 'x'.repeat(512 * 1024)); }
      return handle;
    });
    await expect(new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [file] }).load()).rejects.toThrow(/no complete catalog/);
    expect(captured).toBeDefined(); expect(read).not.toHaveBeenCalled(); expect(captured!.fd).toBe(-1);
  });

  it('does not open a manifest symlink escaping an explicitly selected directory', async () => {
    const selected = path.join(workspace, 'selected'); fs.mkdirSync(selected);
    const outside = path.join(workspace, 'outside.md'); fs.writeFileSync(outside, 'PRIVATE_MANIFEST');
    fs.symlinkSync(outside, path.join(selected, 'SKILL.md'));
    const opened = vi.spyOn(fsp, 'open');
    expect([...(await new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [selected] }).load()).values()]).toEqual([]);
    expect(opened.mock.calls.some(([target]) => target === outside || target === path.join(selected, 'SKILL.md'))).toBe(false);
  });

  it.each(['metadata', 'open'] as const)('rejects resource exhaustion during manifest %s instead of returning a partial catalog', async stage => {
    const file = path.join(workspace, 'named.md'); fs.writeFileSync(file, 'small');
    const error = Object.assign(new Error('PRIVATE_RESOURCE_DETAIL'), { code: 'EMFILE' });
    if (stage === 'open') {
      const open = fsp.open;
      vi.spyOn(fsp, 'open').mockImplementation((...args) => args[0] === file ? Promise.reject(error) : open(...args));
    } else {
      const stat = fs.statSync;
      vi.spyOn(fs, 'statSync').mockImplementation(((target: fs.PathLike, options: any) => {
        if (target === file) throw error; return stat(target, options);
      }) as typeof stat);
    }
    await expect(new SkillLoader(workspace, { disableDiscovery: true, extraPaths: [file] }).loadDetailed()).rejects.toThrow(/no complete catalog/);
  });

  it.each(['fallback', 'git'] as const)('rejects %s ignore resource exhaustion without publishing hidden skills or private details', async mode => {
    writeSkill('hidden', 'hidden', 'PRIVATE_SKILL_BODY');
    const file = path.join(workspace, '.gitignore');
    fs.writeFileSync(file, '.agents/skills/hidden/\n');
    if (mode === 'fallback') {
      fs.rmSync(path.join(workspace, '.git'), { recursive: true });
      const exists = fs.existsSync;
      vi.spyOn(fs, 'existsSync').mockImplementation(target =>
        path.basename(String(target)) === '.git' ? false : exists(target));
    }
    expect([...(await new SkillLoader(workspace).load()).keys()]).toEqual([]);
    const open = fsp.open;
    let attempts = 0;
    vi.spyOn(fsp, 'open').mockImplementation((...args) => {
      if (args[0] !== file) return open(...args);
      attempts++;
      return Promise.reject(Object.assign(new Error('PRIVATE_RESOURCE_DETAIL'), { code: 'EMFILE' }));
    });
    await expect(new SkillLoader(workspace).loadDetailed()).rejects.toThrow(
      'Skill discovery stopped at its resource limit; no complete catalog is available.');
    expect(attempts).toBeGreaterThan(0);
  });

  it("reads a skill's name, description, and instructions", async () => {
    writeSkill("review", "review", "Read the diff twice.");

    const skill = (await new SkillLoader(workspace).load()).get("review");
    expect(skill?.description).toBe("what review is for");
    expect(skill?.body).toBe("Read the diff twice.");
    expect(skill?.source).toBe("project");
  });

  it("falls back to the folder name when frontmatter omits one", async () => {
    const target = path.join(workspace, ".agents", "skills", "unnamed");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), "just instructions\n", "utf8");

    expect((await new SkillLoader(workspace).load()).get("unnamed")?.body).toBe("just instructions");
  });

  it("honours a skill that turns itself off", async () => {
    writeSkill("off", "off", "never", "enabled: false\n");

    expect((await new SkillLoader(workspace).load()).has("off")).toBe(false);
  });

  it("sorts by name so the list is stable between runs", async () => {
    writeSkill("b", "beta", "b");
    writeSkill("a", "alpha", "a");

    expect([...(await new SkillLoader(workspace).load()).keys()]).toEqual(["alpha", "beta"]);
  });

  it("ignores a folder with no manifest in it", async () => {
    fs.mkdirSync(path.join(workspace, ".agents", "skills", "empty"), { recursive: true });

    expect([...(await new SkillLoader(workspace).load()).keys()]).toEqual([]);
  });
});

describe("name collisions", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-collide-"));
    execFileSync('git', ['init', '-q', workspace]);
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("reports both files when two claim the same name", async () => {
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

    const { skills, collisions } = (await new SkillLoader(workspace).loadDetailed());

    expect(skills.size).toBe(1);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.name).toBe("shared");
    expect(collisions[0]?.winnerPath).toContain("one");
    expect(collisions[0]?.loserPath).toContain("two");
  });

  it("reports nothing when every name is unique", async () => {
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

    expect((await new SkillLoader(workspace).loadDetailed()).collisions).toEqual([]);
  });
});

describe("skill diagnostics", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-diag-"));
    execFileSync('git', ['init', '-q', workspace]);
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

  it("reports a skill that has no description instead of dropping it silently", async () => {
    // The skill cannot be matched by the model without a description, so it never
    // appears — and with no diagnostic the author has nothing to go on.
    writeRaw("mute", "name: mute");

    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());

    expect(diagnostics.some((d) => d.name === "mute" && /description/.test(d.message))).toBe(true);
  });

  it("keeps loading a skill whose name is not in the expected format", async () => {
    // A bad name is a blemish, not an unusable skill: it is still loadable by
    // name, so refusing it would lose working instructions over cosmetics.
    writeRaw("odd", "name: Not A Valid Name\ndescription: still useful");

    const { skills, diagnostics } = (await new SkillLoader(workspace).loadDetailed());

    expect(skills.has("Not A Valid Name")).toBe(true);
    expect(diagnostics.some((d) => /name/i.test(d.message))).toBe(true);
  });

  it("reports a name that is too long", async () => {
    writeRaw("long", `name: ${"a".repeat(65)}\ndescription: too long a name`);

    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());

    expect(diagnostics.some((d) => /64/.test(d.message))).toBe(true);
  });

  it("says nothing about a skill that is well formed", async () => {
    writeRaw("fine", "name: fine-skill\ndescription: perfectly ordinary");

    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());

    expect(diagnostics).toEqual([]);
  });

  it("flags a name that starts or ends with a hyphen", async () => {
    // Inside the character set but outside the shape a name can be called by:
    // `-review` reads as a flag everywhere it is written.
    writeRaw("lead", "name: -review\ndescription: leading hyphen");
    writeRaw("tail", "name: review-\ndescription: trailing hyphen");
    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());
    expect(diagnostics.some((d) => d.name === "-review" && /hyphen/.test(d.message))).toBe(true);
    expect(diagnostics.some((d) => d.name === "review-" && /hyphen/.test(d.message))).toBe(true);
  });

  it("flags a name with consecutive hyphens", async () => {
    writeRaw("double", "name: code--review\ndescription: doubled hyphen");
    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());
    expect(diagnostics.some((d) => d.name === "code--review" && /consecutive/.test(d.message))).toBe(true);
  });
  it("reads a multi-line description instead of the block marker", async () => {
    // A block scalar previously yielded the literal `|-` as the description.
    // Nothing rejects that — it is simply the wrong text, which is why it went
    // unnoticed: the skill loads and the model matches against a marker.
    writeRaw("folded", "name: folded\ndescription: |-\n  Build for AWS.\n  Handles ECS.\nlicense: MIT");

    const { skills } = (await new SkillLoader(workspace).loadDetailed());

    expect(skills.get("folded")?.description).toBe("Build for AWS.\nHandles ECS.");
  });

  it("reads a block scalar that names its own indentation", async () => {
    // `|2-` and `|-2` are block headers with the indicators in either order, and
    // both are valid YAML. Matching only `|` plus a chomping character meant the
    // header fell through to the scalar branch and the description became the
    // literal text `|2-` — the same defect as the `|-` one above, one indicator
    // further along.
    for (const header of ["|2-", "|-2", "|2", ">2-"]) {
      writeRaw("indented", `name: indented\ndescription: ${header}\n  Build for AWS.\n  Handles ECS.`);

      const { skills } = (await new SkillLoader(workspace).loadDetailed());

      expect(skills.get("indented")?.description).toBe(
        header.startsWith(">") ? "Build for AWS. Handles ECS." : "Build for AWS.\nHandles ECS.",
      );
    }
  });

  it("names every spec field it accepts but does not act on", async () => {
    // A field left off the list is dropped silently: the author wrote something
    // the format defines and nothing tells them it does nothing here. The list
    // has to cover what the parser accepts, not only what looks important.
    writeRaw(
      "declared",
      "name: declared\ndescription: d\nargument-hint: <file>\ndisable-model-invocation: true\nmodel: opus",
    );

    const { skills } = (await new SkillLoader(workspace).loadDetailed());

    expect(skills.get("declared")?.unhonouredFields).toEqual([
      "disable-model-invocation",
      "argument-hint",
      "model",
    ]);
  });

  it("folds a folded block scalar onto one line", async () => {
    writeRaw("folded", "name: folded\ndescription: >\n  Build for AWS.\n  Handles ECS.");

    const { skills } = (await new SkillLoader(workspace).loadDetailed());

    expect(skills.get("folded")?.description).toBe("Build for AWS. Handles ECS.");
  });

  it("keeps a colon inside a quoted value", async () => {
    // The value is quoted precisely so it may contain one, so the quotes are
    // removed and what is between them is kept.
    writeRaw("quoted", 'name: quoted\ndescription: "Build for AWS: ECS"');

    const { skills } = (await new SkillLoader(workspace).loadDetailed());

    expect(skills.get("quoted")?.description).toBe("Build for AWS: ECS");
  });

  it("reports a spec field it records but does not act on", async () => {
    // `allowed-tools` reads as a restriction in force. This build has no
    // per-skill tool gate, so the author has to be told rather than left to
    // believe something is being enforced.
    writeRaw("scoped", "name: scoped\ndescription: uses a field we do not honour\nallowed-tools: read, glob");

    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());

    expect(diagnostics.some((d) => d.name === "scoped" && /allowed-tools/.test(d.message))).toBe(true);
  });

  it("does not report a field nobody defined", async () => {
    // The ecosystem ignores unknown fields by convention. Warning about them
    // would train the reader to ignore the warnings that matter.
    writeRaw("odd", "name: odd\ndescription: has a private field\nx-internal-note: whatever");

    const { diagnostics } = (await new SkillLoader(workspace).loadDetailed());

    expect(diagnostics.some((d) => /x-internal-note/.test(d.message))).toBe(false);
  });
});

describe("named skill paths", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-cli-"));
    execFileSync('git', ['init', '-q', workspace]);
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

  it("loads a named file directly, whatever its name", async () => {
    // The point of naming a file is to load that file; a manifest convention
    // that rejects it would make the flag depend on how the author filed it.
    fs.mkdirSync(path.join(workspace, "loose"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "loose", "review.md"),
      "---\nname: named-review\ndescription: a named skill\n---\n\nnamed body\n",
      "utf8",
    );
    const skills = (await new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "loose", "review.md")],
    }).load());
    expect(skills.get("named-review")?.source).toBe("cli");
  });

  it("searches a named directory the way a discovered one is searched", async () => {
    fs.mkdirSync(path.join(workspace, "bundle"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "bundle", "inner"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "bundle", "inner", "SKILL.md"),
      "---\nname: bundled\ndescription: inside a named directory\n---\n\nbundled body\n",
      "utf8",
    );
    const skills = (await new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "bundle")],
    }).load());
    expect(skills.has("bundled")).toBe(true);
  });

  it("wins a name a discovered skill shares", async () => {
    // The user pointed at the file, and that is the more specific statement
    // about which one this run means.
    writeDiscovered("review");
    fs.mkdirSync(path.join(workspace, "named"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "named", "SKILL.md"),
      "---\nname: review\ndescription: the named one\n---\n\nnamed body\n",
      "utf8",
    );
    const skills = (await new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "named")],
    }).load());
    expect(skills.get("review")?.source).toBe("cli");
  });

  it("silences every discovered skill when asked, keeping the named ones", async () => {
    writeDiscovered("discovered");
    fs.writeFileSync(
      path.join(workspace, "explicit.md"),
      "---\nname: explicit\ndescription: the named one\n---\n\nnamed body\n",
      "utf8",
    );
    const skills = (await new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "explicit.md")],
      disableDiscovery: true,
    }).load());
    expect(skills.has("discovered")).toBe(false);
    expect([...skills.keys()]).toEqual(["explicit"]);
  });
});

describe("a named path that loads nothing", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-missing-"));
    execFileSync('git', ['init', '-q', workspace]);
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("says so rather than loading nothing in silence", async () => {
    // The user named this file on the command line. Silence would leave a typo
    // looking exactly like a skill the model chose not to use, so the loader has
    // to report the path it could not read.
    const { skills, failures } = (await new SkillLoader(workspace, {
      extraPaths: [path.join(workspace, "typo.md")],
    }).loadDetailed());

    expect([...skills.keys()]).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.filePath).toBe(path.join(workspace, "typo.md"));
    expect(failures[0]?.message).toContain("does not exist");
  });

  it("stays silent about a discovered root that is simply not there", async () => {
    // A fresh install has no `~/.cheers/skills` and no project skills directory.
    // Reporting those would make every first run look broken.
    const { failures } = (await new SkillLoader(workspace).loadDetailed());
    expect(failures).toEqual([]);
  });
});

describe("the repository's ignore rules", () => {
  let workspace = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skills-ignore-"));
    // A repository, so git answers the question the way it does in a real
    // checkout. Outside one the rules are matched in-process, which the next
    // case covers.
    execFileSync("git", ["init", "-q"], { cwd: workspace });
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function writeSkillAt(relative: string, name: string): string {
    const dir = path.join(workspace, relative);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: what ${name} is for\n---\n\n${name} body\n`,
      "utf8",
    );
    return dir;
  }

  it("does not discover a skill inside a directory the repository ignores", async () => {
    // A `.gitignore` is the project saying which of its files are not part of
    // it. Reading a skill from one would put text the user deliberately
    // excluded into the prompt, while every other tool hid that directory — the
    // model would be the only party that never learned it was excluded.
    fs.writeFileSync(path.join(workspace, ".gitignore"), "vendor/\n", "utf8");
    writeSkillAt(path.join(".agents", "skills", "vendor", "leaked"), "leaked");
    writeSkillAt(path.join(".agents", "skills", "kept"), "kept");

    expect([...(await new SkillLoader(workspace).load()).keys()]).toEqual(["kept"]);
  });

  it('preserves ancestor tracked skills and admitted include/exclude rules', async () => {
    const tracked = writeSkillAt('.agents/skills/vendor/tracked', 'tracked');
    writeSkillAt('.agents/skills/vendor/untracked', 'untracked');
    writeSkillAt('.agents/skills/excluded', 'excluded');
    writeSkillAt('.agents/skills/kept', 'kept');
    fs.writeFileSync(path.join(workspace, '.gitignore'), 'vendor/\n');
    fs.writeFileSync(path.join(workspace, 'excludes'), 'excluded/\n');
    fs.writeFileSync(path.join(workspace, 'included.config'), `[core]\nexcludesFile=${path.join(workspace, 'excludes')}\n`);
    execFileSync('git', ['-C', workspace, 'config', 'include.path', '../included.config']);
    execFileSync('git', ['-C', workspace, 'add', '-f', path.relative(workspace, path.join(tracked, 'SKILL.md'))]);
    const nested = path.join(workspace, 'packages', 'app'); fs.mkdirSync(nested, { recursive: true });
    expect([...(await new SkillLoader(nested).load()).keys()].sort()).toEqual(['kept', 'tracked']);
  });

  it("still loads a skill the user named, whatever the rules say", async () => {
    // Naming a path is a more specific statement than a pattern that happens to
    // match it. Honouring the pattern here would make `--skill <dir>` silently
    // do nothing, which is the failure this whole flag exists to avoid.
    fs.writeFileSync(path.join(workspace, ".gitignore"), "vendor/\n", "utf8");
    const named = writeSkillAt(path.join(".agents", "skills", "vendor", "leaked"), "leaked");

    const skills = (await new SkillLoader(workspace, { extraPaths: [named] }).load());
    expect([...skills.keys()]).toEqual(["leaked"]);
  });

  it("applies the same rules when there is no repository to ask", async () => {
    // git exits 128 outside a repository, and losing ignore support there would
    // be a gap rather than a degradation: the same `.gitignore` should mean the
    // same thing whether or not the directory happens to be a checkout.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "skills-bare-"));
    const exists = fs.existsSync;
    const marker = vi.spyOn(fs, 'existsSync').mockImplementation(file => path.basename(String(file)) === '.git' ? false : exists(file));
    try {
      fs.writeFileSync(path.join(bare, ".gitignore"), "vendor/\n", "utf8");
      const dir = path.join(bare, ".agents", "skills", "vendor", "leaked");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "SKILL.md"),
        "---\nname: leaked\ndescription: excluded\n---\n\nbody\n",
        "utf8",
      );
      expect([...(await new SkillLoader(bare).load()).keys()]).toEqual([]);
    } finally {
      marker.mockRestore();
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
