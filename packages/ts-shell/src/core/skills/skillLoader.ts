import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Skill discovery.
 *
 * A skill is a folder with a `SKILL.md` in it: frontmatter naming and describing
 * it, and a body of instructions. That shape is what the reference
 * implementations settled on, and it is worth matching exactly — a skill someone
 * already wrote should work here without being rewritten.
 *
 * Skills are instructions, not code. Loading one injects text into the next turn;
 * nothing is executed by discovery, which is why scanning is safe to do eagerly.
 */

export type SkillSource = "user" | "project";

export interface Skill {
  readonly name: string;
  readonly description: string;
  /** Instruction body, with the frontmatter removed. */
  readonly body: string;
  readonly filePath: string;
  readonly source: SkillSource;
}

const MANIFEST = "SKILL.md";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export class SkillLoader {
  private readonly roots: readonly { readonly dir: string; readonly source: SkillSource }[];

  constructor(workspaceRoot: string = process.cwd()) {
    const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
    this.roots = [
      { dir: path.join(home, ".private-agents", "skills"), source: "user" },
      // Project skills win: a repository that ships its own way of doing something
      // should override the user's general habit for that repository.
      { dir: path.join(path.resolve(workspaceRoot), ".agents", "skills"), source: "project" },
    ];
  }

  /** Every discoverable skill, keyed by name, project overriding user. */
  load(): ReadonlyMap<string, Skill> {
    const skills = new Map<string, Skill>();
    for (const root of this.roots) {
      for (const skill of this.scan(root.dir, root.source)) skills.set(skill.name, skill);
    }
    return skills;
  }

  private scan(dir: string, source: SkillSource): Skill[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found: Skill[] = [];
    for (const entry of entries) {
      const filePath = entry.isDirectory()
        ? path.join(dir, entry.name, MANIFEST)
        : entry.name.endsWith(".md")
          ? path.join(dir, entry.name)
          : undefined;
      if (!filePath) continue;
      const skill = readSkill(filePath, entry.isDirectory() ? entry.name : undefined, source);
      if (skill) found.push(skill);
    }
    return found.sort((left, right) => left.name.localeCompare(right.name));
  }
}

/** One skill file, or undefined when it is unreadable or turned off. */
function readSkill(
  filePath: string,
  dirName: string | undefined,
  source: SkillSource,
): Skill | undefined {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  const match = FRONTMATTER.exec(content);
  const fields = match ? parseFields(match[1]!) : new Map<string, string>();
  if (fields.get("enabled") === "false") return undefined;
  const fallback = dirName ?? path.basename(filePath, ".md");
  return {
    name: fields.get("name")?.trim() || fallback,
    description: fields.get("description")?.trim() ?? "",
    body: (match ? content.slice(match[0].length) : content).trim(),
    filePath,
    source,
  };
}

/**
 * Frontmatter as flat key/value pairs.
 *
 * Deliberately not a YAML parser: skill frontmatter in practice is a handful of
 * scalars, and pulling in a parser to read `name:` would be the larger mistake.
 * A line that is not a scalar is skipped rather than guessed at.
 */
function parseFields(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0 || line.startsWith("#") || line.startsWith(" ")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key) fields.set(key, value);
  }
  return fields;
}
