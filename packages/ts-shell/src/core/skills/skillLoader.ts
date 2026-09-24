import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveAllUserDataFiles, userDataDir } from "../paths/userHome.js";
import { projectDirectories } from "../project/directories.js";

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

export type SkillSource = "user" | "project" | "cli";

/** Something wrong with a skill that did not prevent it loading, or did. */
export interface SkillDiagnostic {
  readonly name: string
  readonly filePath: string
  readonly message: string
}

/** Two skill files that claimed the same name, and which one was kept. */
export interface SkillCollision {
  readonly name: string
  readonly winnerPath: string
  readonly loserPath: string
}

export interface Skill {
  readonly name: string;
  readonly description: string;
  /** Instruction body, with the frontmatter removed. */
  readonly body: string;
  readonly filePath: string;
  readonly source: SkillSource;
  /**
   * Whether the model may see this skill.
   *
   * A skill hidden this way is still discoverable and still loadable by name on
   * request; it is only absent from the list the model reads. That distinction is
   * the point: "do not put this in front of the model" is a different wish from
   * "this skill does not exist", and only the first has a reason to keep the
   * skill reachable.
   */
  readonly disableModelInvocation: boolean;
}

const MANIFEST = "SKILL.md";

/**
 * Per the Agent Skills spec: a length bound and a character set.
 *
 * Checked because a name is not only a label — it is what a caller writes to load
 * the skill, and it is interpolated into the prompt. Characters outside this set
 * make the name awkward to quote and can break the tags it appears in.
 */
const MAX_NAME_LENGTH = 64;
const VALID_NAME = /^[a-z0-9-]+$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export class SkillLoader {
  private readonly roots: readonly { readonly dir: string; readonly source: SkillSource }[];
  /** Paths the user named explicitly, as files or directories. */
  private readonly extraPaths: readonly string[];
  /** Whether the discovered roots are read at all. */
  private readonly disableDiscovery: boolean;
  /**
   * Named paths that could not be loaded, with why.
   *
   * Kept apart from `SkillDiagnostic` because they describe the path rather than
   * a skill: there is no name to attribute them to, and nothing was inspected.
   * Collected during `loadDetailed` rather than the constructor so a loader that
   * is never asked to load reports nothing.
   */
  private readonly failures: { readonly filePath: string; readonly message: string }[] = [];

  constructor(
    workspaceRoot: string = process.cwd(),
    options: {
      /**
       * Files or directories the user named on the command line. A file is
       * loaded directly, whatever its name; a directory is searched the way a
       * discovered one is.
       *
       * These load even when discovery is off: a named path is the user's
       * direct instruction, and a switch that silenced it would make the two
       * flags disagree about who owns the run.
       */
      readonly extraPaths?: readonly string[];
      /** Skip every discovered root; only named paths are read. */
      readonly disableDiscovery?: boolean;
    } = {},
  ) {
    // Every user skills directory that exists, newest first. A listing that read
    // only the current one would hide skills the user already wrote in an older
    // location — they are additional, not superseded. When none exists yet, the
    // current path stands in as the place new skills would be written.
    const userSkillDirs = resolveAllUserDataFiles("skills");
    // Every project directory from the working one up to the root, so a skill
    // kept at the repository root is found when the session starts in a
    // subdirectory. Reading only the working directory made those skills
    // invisible, with nothing said about it.
    //
    // Nearest first, because within one source the first file found wins: a skill
    // written for a subdirectory is the more specific statement and should take
    // precedence over one written for the whole repository.
    const projectSkillDirs = [...projectDirectories(workspaceRoot)].reverse().map((dir) => ({
      dir: path.join(dir, ".agents", "skills"),
      source: "project" as const,
    }));
    this.extraPaths = options.extraPaths ?? [];
    this.disableDiscovery = options.disableDiscovery ?? false;
    this.roots = this.disableDiscovery
      ? []
      : [
          ...(userSkillDirs.length > 0 ? userSkillDirs : [path.join(userDataDir(), "skills")]).map(
            (dir) => ({ dir, source: "user" as const }),
          ),
          // Project skills win: a repository that ships its own way of doing something
          // should override the user's general habit for that repository.
          ...projectSkillDirs,
        ];
  }

  /** Every discoverable skill, keyed by name, project overriding user. */
  load(): ReadonlyMap<string, Skill> {
    return this.loadDetailed().skills;
  }

  /**
   * The skills, and every name more than one file claimed.
   *
   * A collision is reported rather than left silent because the losing file is
   * otherwise invisible: the winner simply appears and the other never does, so
   * nobody learns that editing it has no effect.
   *
   * Within one root the first file found wins, which is what makes the result
   * stable across runs; across roots the project overrides the user, which is
   * deliberate — a repository that ships its own way of doing something should
   * override the user's general habit for that repository.
   */
  loadDetailed(): {
    skills: ReadonlyMap<string, Skill>
    collisions: readonly SkillCollision[]
    diagnostics: readonly SkillDiagnostic[]
    /** Named paths that could not be loaded. Empty unless one was named. */
    failures: readonly { readonly filePath: string; readonly message: string }[]
  } {
    const skills = new Map<string, Skill>();
    const collisions: SkillCollision[] = [];
    const diagnostics: SkillDiagnostic[] = [];
    this.failures.length = 0;
    // Named paths last, so an explicit file wins a name a discovered skill
    // shares: the user pointed at it, and that is the more specific statement.
    for (const root of [
      ...this.roots,
      ...this.extraPaths.map((entry) => ({ dir: entry, source: "cli" as const })),
    ]) {
      for (const skill of this.loadRoot(root.dir, root.source)) {
        diagnostics.push(...inspectSkill(skill));
        const existing = skills.get(skill.name);
        if (existing && existing.source === skill.source) {
          collisions.push({
            name: skill.name,
            winnerPath: existing.filePath,
            loserPath: skill.filePath,
          });
          continue;
        }
        if (existing) {
          collisions.push({
            name: skill.name,
            winnerPath: skill.filePath,
            loserPath: existing.filePath,
          });
        }
        skills.set(skill.name, skill);
      }
    }
    return { skills, collisions, diagnostics, failures: [...this.failures] };
  }

  /**
   * The skills one root holds, whether that root is a discovered directory or a
   * path the user named.
   *
   * A named file loads directly whatever its name — the point of naming it is
   * to load that file, not whatever a directory convention says it should be
   * called. A named directory is searched like a discovered one. The roots
   * this loader discovered are all directories, so for them this is the plain
   * scan.
   */
  private loadRoot(dirOrFile: string, source: SkillSource): Skill[] {
    // Only a path the user named can be reported missing. A discovered root that
    // is absent is the ordinary state of a fresh install — nobody asked for
    // `~/.cheers/skills`, so its absence says nothing worth saying.
    const report = source === "cli";
    let stats: fs.Stats;
    try {
      stats = fs.statSync(dirOrFile);
    } catch (error) {
      if (report) {
        this.failures.push({
          filePath: dirOrFile,
          message:
            error instanceof Error && "code" in error && error.code === "ENOENT"
              ? "does not exist, so nothing was loaded from it"
              : `could not be read (${error instanceof Error ? error.message : String(error)})`,
        });
      }
      return [];
    }
    if (stats.isFile()) {
      const skill = readSkill(dirOrFile, undefined, source);
      if (!skill && report) {
        this.failures.push({
          filePath: dirOrFile,
          message: "is not a readable skill file, so nothing was loaded from it",
        });
      }
      return skill ? [skill] : [];
    }
    if (!stats.isDirectory()) {
      // A FIFO, socket, or device node. `scan` would swallow the ENOTDIR that
      // readdirSync raises, and the named path would vanish with no explanation.
      if (report) {
        this.failures.push({
          filePath: dirOrFile,
          message: "is neither a file nor a directory, so nothing was loaded from it",
        });
      }
      return [];
    }
    return this.scan(dirOrFile, source, true);
  }

  /**
   * Every skill at or below `dir`.
   *
   * Recursive, with one rule that decides the shape: a directory holding a
   * `SKILL.md` is a skill and is not descended into, because everything under it
   * belongs to that skill — its scripts, its references, its own nested files. A
   * directory without one is just a grouping directory, and is searched.
   *
   * Reading only one level loses every skill grouped into a subdirectory, which
   * is the layout a real skill collection uses. Missing skills are worse than
   * found ones are good: the model cannot use a skill it was never told about,
   * and it has no way to notice the omission.
   */
  private scan(dir: string, source: SkillSource, isRoot: boolean): Skill[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    // A directory holding a manifest is itself the skill, at any depth: its
    // subdirectories are that skill's own files, not more skills.
    const manifestPath = path.join(dir, MANIFEST);
    if (fs.existsSync(manifestPath)) {
      const skill = readSkill(manifestPath, path.basename(dir), source);
      return skill ? [skill] : [];
    }

    const found: Skill[] = [];
    for (const entry of entries) {
      // Dot-directories hold tooling state rather than skills, and a dependency
      // directory holds other people's skills. Neither is this project's.
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        found.push(...this.scan(path.join(dir, entry.name), source, false));
        continue;
      }
      // Loose files are only skills at the root. Deeper down, a bare `.md` is
      // more likely to be part of the skill above it than a skill of its own.
      if (isRoot && entry.name.endsWith(".md")) {
        const skill = readSkill(path.join(dir, entry.name), undefined, source);
        if (skill) found.push(skill);
      }
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
    disableModelInvocation: fields.get("disable-model-invocation")?.trim() === "true",
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

/**
 * The skill list as the model reads it, or the empty string when there are none.
 *
 * Only names and descriptions appear. The body is fetched by the skill tool when
 * a description matches the task, because injecting every body would grow the
 * prompt with the whole collection while the task needs one of it.
 *
 * A skill marked `disable-model-invocation` is left out here and remains loadable
 * by name, which is the whole point of the flag.
 */
export function renderSkillList(skills: ReadonlyMap<string, Skill>): string {
  const visible = [...skills.values()]
    .filter((skill) => !skill.disableModelInvocation && skill.description !== "")
    .sort((left, right) => left.name.localeCompare(right.name));
  if (visible.length === 0) return "";

  const lines = [
    "The following skills provide instructions for specific tasks. When a task matches a description, load it with the skill tool before starting.",
    "",
    "<available_skills>",
  ];
  for (const skill of visible) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    // A source annotation, not an instruction to read it: the file may live
    // outside the workspace, so the file reader would refuse it. It is here so the
    // model can tell where a rule comes from, which is what makes two skills with
    // similar descriptions distinguishable.
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

/** XML-escape a value so a description cannot close the tag that carries it. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * What is wrong with a skill, without deciding whether to keep it.
 *
 * The two findings are deliberately not the same severity. A missing description
 * means the model can never match the skill, so it is invisible in every sense —
 * the author needs to be told. A malformed name or an over-long description is a
 * blemish: the skill still loads and still works when asked for by name, so it is
 * reported and kept rather than refused. Discarding working instructions over
 * cosmetics would be the worse trade.
 */
function inspectSkill(skill: Skill): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  const note = (message: string): void => {
    diagnostics.push({ name: skill.name, filePath: skill.filePath, message });
  };

  if (skill.description.trim() === "") {
    note("has no description, so the model cannot match it; it will not appear in the skill list");
  }
  if (skill.name.length > MAX_NAME_LENGTH) {
    note(`name exceeds ${MAX_NAME_LENGTH} characters (${skill.name.length})`);
  } else if (!VALID_NAME.test(skill.name)) {
    note("name contains characters outside lowercase a-z, 0-9 and hyphens");
  } else if (skill.name.startsWith("-") || skill.name.endsWith("-")) {
    // A leading or trailing hyphen is inside the character set but outside the
    // shape a name can be called by: `-review` reads as a flag, and a shell
    // treats it like one too.
    note("name starts or ends with a hyphen");
  } else if (skill.name.includes("--")) {
    // Consecutive hyphens make the name hard to tell apart from one whose
    // hyphen was doubled by a typo, and they are not a shape anything else
    // in the workspace uses.
    note("name contains consecutive hyphens");
  }

  return diagnostics;
}
