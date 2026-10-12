import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { userDataSearchDirs } from "../paths/userHome.js";
import { projectDirectories } from "../project/directories.js";
import { loadIgnoredDirectories } from "../../runtime/execution/ignoreRules.js";
import { SkillDiscovery } from './discovery.js';
import type { WalkLimits } from '../../runtime/execution/walk/budget.js';

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

export type SkillSource = "user" | "project" | "cli" | "extension";

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
  /** Captured feature text can be revoked while a turn still holds its catalog. */
  readonly isCurrent?: () => boolean;
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
  /**
   * Spec fields the author wrote that this build does not act on.
   *
   * Named so a diagnostic can say which ones. Writing `allowed-tools` and
   * having nothing happen is the case worth reporting: the author believes a
   * restriction is in force. An unknown field is not reported — the ecosystem
   * ignores those by convention, and warning about a field nobody defined would
   * train the reader to ignore the warnings that matter.
   */
  readonly unhonouredFields: readonly string[];
}

const MANIFEST = "SKILL.md";

/**
 * Frontmatter fields the skill format defines but this build does not act on.
 *
 * `allowed-tools` would scope a skill to a set of tools, and there is no
 * per-skill tool gate here — the tool gate decides by tool name and permission
 * scope. `disable-model-invocation` and `user-invocable` would decide who may
 * invoke a skill, and this build has one caller. `argument-hint` would describe
 * the arguments a command takes, and no surface renders one. The rest select a
 * model, a forked context, a shell, or a trigger path — capabilities this build
 * does not have per skill. Listing them means a diagnostic can distinguish "the
 * format defines this" from "this build ignores this", which is the difference
 * the author needs to know. A field left off this list is silently dropped, so
 * the list has to name every field the parser accepts, not only the ones that
 * look important.
 */
const UNHONOURED_SPEC_FIELDS = [
  "allowed-tools",
  "license",
  "compatibility",
  "metadata",
  "disable-model-invocation",
  "user-invocable",
  "argument-hint",
  "arguments",
  "when_to_use",
  "when-to-use",
  "model",
  "effort",
  "context",
  "agent",
  "paths",
  "shell",
  "hooks",
  "version",
  "hide-from-slash-command-tool",
  "force-for-plugin",
  "background",
  "color",
  "isolation",
  "keep-coding-instructions",
  "skills",
] as const;

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
  private readonly roots: readonly { readonly dir: string; readonly source: SkillSource; readonly boundary: string }[];
  /** Paths the user named explicitly, as files or directories. */
  private readonly extraPaths: readonly string[];
  /** Whether the discovered roots are read at all. */
  private readonly disableDiscovery: boolean;
  private readonly onSource?: (target: string) => void;
  private readonly signal?: AbortSignal;
  private readonly limits?: WalkLimits;
  private readonly discovery?: SkillDiscovery;

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
      /** Report paths actually visited, before reading, for optional change observation. */
      readonly onSource?: (target: string) => void;
      readonly abortSignal?: AbortSignal;
      readonly limits?: WalkLimits;
      /** An enclosing catalog shares one budget across builtins and extensions. */
      readonly discovery?: SkillDiscovery;
      readonly allowProject?: boolean;
    } = {},
  ) {
    // Every user skills directory, newest first. A listing that read
    // only the current one would hide skills the user already wrote in an older
    // location — they are additional, not superseded. Missing roots are also
    // reported to observers so later creation can invalidate a cached listing.
    const userSkillDirs = userDataSearchDirs().map(directory => path.join(directory, "skills"));
    // Every project directory from the working one up to the root, so a skill
    // kept at the repository root is found when the session starts in a
    // subdirectory. Reading only the working directory made those skills
    // invisible, with nothing said about it.
    //
    // Nearest first, because within one source the first file found wins: a skill
    // written for a subdirectory is the more specific statement and should take
    // precedence over one written for the whole repository.
    const projectDirs = projectDirectories(workspaceRoot);
    const projectSkillDirs = [...projectDirs].reverse().map((dir) => ({
      dir: path.join(dir, ".agents", "skills"),
      source: "project" as const,
      boundary: projectDirs[0]!,
    }));
    this.extraPaths = options.extraPaths ?? [];
    this.disableDiscovery = options.disableDiscovery ?? false;
    this.onSource = options.onSource;
    this.signal = options.abortSignal;
    this.limits = options.limits;
    this.discovery = options.discovery;
    this.roots = this.disableDiscovery
      ? []
      : [
          ...userSkillDirs.map(
            (dir) => ({ dir, source: "user" as const, boundary: path.dirname(dir) }),
          ),
          // Project skills win: a repository that ships its own way of doing something
          // should override the user's general habit for that repository.
          ...(options.allowProject === false ? [] : projectSkillDirs),
        ];
  }

  /** Every discoverable skill, keyed by name, project overriding user. */
  async load(): Promise<ReadonlyMap<string, Skill>> {
    return (await this.loadDetailed()).skills;
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
  async loadDetailed(): Promise<{
    skills: ReadonlyMap<string, Skill>
    collisions: readonly SkillCollision[]
    diagnostics: readonly SkillDiagnostic[]
    /** Named paths that could not be loaded. Empty unless one was named. */
    failures: readonly { readonly filePath: string; readonly message: string }[]
  }> {
    const skills = new Map<string, Skill>();
    const collisions: SkillCollision[] = [];
    const diagnostics: SkillDiagnostic[] = [];
    const failures: { filePath: string; message: string }[] = [];
    const discovery = this.discovery ?? new SkillDiscovery(this.signal, this.limits);
    // Named paths last, so an explicit file wins a name a discovered skill
    // shares: the user pointed at it, and that is the more specific statement.
    for (const root of [
      ...this.roots,
      ...this.extraPaths.map((entry) => ({ dir: entry, source: "cli" as const, boundary: undefined })),
    ]) {
      for (const skill of await this.loadRoot(root.dir, root.source, root.boundary, discovery, failures)) {
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
    discovery.verify();
    return { skills, collisions, diagnostics, failures };
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
  private async loadRoot(dirOrFile: string, source: SkillSource, boundary: string | undefined, discovery: SkillDiscovery,
    failures: { filePath: string; message: string }[]): Promise<Skill[]> {
    this.onSource?.(dirOrFile);
    // Only a path the user named can be reported missing. A discovered root that
    // is absent is the ordinary state of a fresh install — nobody asked for
    // `~/.cheers/skills`, so its absence says nothing worth saying.
    const report = source === "cli";
    let stats: fs.Stats;
    try {
      stats = fs.statSync(dirOrFile);
    } catch (error) {
      discovery.rethrow(error);
      if (report) {
        failures.push({
          filePath: dirOrFile,
          message:
            error instanceof Error && "code" in error && error.code === "ENOENT"
              ? "does not exist, so nothing was loaded from it"
              : `could not be read (${error instanceof Error ? error.message : String(error)})`,
        });
      }
      return [];
    }
    // An explicit path selects its current canonical root; discovered paths stay
    // within the project or user-data root that admitted them.
    try {
      if (!boundary) {
        dirOrFile = fs.realpathSync(dirOrFile);
        boundary = stats.isDirectory() ? dirOrFile : path.dirname(dirOrFile);
      }
      discovery.root(boundary);
    } catch (error) {
      discovery.rethrow(error);
      failures.push({ filePath: dirOrFile, message: 'could not be read from its selected root' });
      return [];
    }
    if (stats.isFile()) {
      const skill = await this.readSkill(dirOrFile, undefined, source, boundary, discovery);
      if (!skill && report) {
        failures.push({
          filePath: dirOrFile,
          message: "is not a readable skill file, so nothing was loaded from it",
        });
      }
      return skill ? [skill] : [];
    }
    if (!stats.isDirectory()) {
      // A FIFO, socket, or device node. `scan` would swallow the ENOTDIR that
      // directory enumeration rejects, and the named path would vanish without an explanation.
      if (report) {
        failures.push({
          filePath: dirOrFile,
          message: "is neither a file nor a directory, so nothing was loaded from it",
        });
      }
      return [];
    }
    return this.scan(dirOrFile, source, true, boundary, discovery, 0);
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
  private async scan(dir: string, source: SkillSource, isRoot: boolean, boundary: string, discovery: SkillDiscovery, depth: number): Promise<Skill[]> {
    this.onSource?.(dir);
    let entries: fs.Dirent[];
    try {
      entries = await discovery.directory(boundary, dir, depth);
    } catch (error) {
      discovery.rethrow(error);
      return [];
    }

    // A directory holding a manifest is itself the skill, at any depth: its
    // subdirectories are that skill's own files, not more skills.
    const manifestPath = path.join(dir, MANIFEST);
    if (entries.some(entry => entry.name === MANIFEST)) {
      const skill = await this.readSkill(manifestPath, path.basename(dir), source, boundary, discovery);
      return skill ? [skill] : [];
    }

    const found: Skill[] = [];
    const candidates = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules');
    let ignored: ReadonlySet<string> = new Set();
    if (source === 'project') {
      try {
        ignored = await loadIgnoredDirectories(discovery.root(boundary), dir,
          candidates.map(entry => entry.name), { abortSignal: this.signal, assertFileAccess: absolute => {
            this.onSource?.(absolute); discovery.root(boundary);
          } }, discovery.budget);
      } catch (error) {
        discovery.rethrow(error);
        throw error;
      }
    }
    for (const entry of entries) {
      // Dot-directories hold tooling state rather than skills, and a dependency
      // directory holds other people's skills. Neither is this project's.
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const child = path.join(dir, entry.name);
        // The repository's own ignore rules apply here as they do to every tool:
        // a skill inside a directory git excludes is not part of what this
        // project offers. Reading it anyway would put text from a directory the
        // user deliberately excluded into the prompt, and the model would be the
        // only party that never learned it was excluded.
        //
        // Not for a path the user named: pointing at a directory is a more
        // specific statement than a pattern that happens to match it, so a
        // `--skill <dir>` whose contents the repository ignores still loads.
        if (ignored.has(entry.name)) continue;
        found.push(...await this.scan(child, source, false, boundary, discovery, depth + 1));
        continue;
      }
      // Loose files are only skills at the root. Deeper down, a bare `.md` is
      // more likely to be part of the skill above it than a skill of its own.
      if (isRoot && entry.name.endsWith(".md")) {
        const skill = await this.readSkill(path.join(dir, entry.name), undefined, source, boundary, discovery);
        if (skill) found.push(skill);
      }
    }
    return found.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async readSkill(file: string, dirName: string | undefined, source: SkillSource, boundary: string, discovery: SkillDiscovery): Promise<Skill | undefined> {
    try { return parseSkill(await discovery.content(boundary, file), file, dirName, source); }
    catch (error) { discovery.rethrow(error); return undefined; }
  }
}

/** One skill file, or undefined when it is unreadable or turned off. */
function parseSkill(
  content: string,
  filePath: string,
  dirName: string | undefined,
  source: SkillSource,
): Skill | undefined {
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
    unhonouredFields: UNHONOURED_SPEC_FIELDS.filter((field) => fields.has(field)),
  };
}

/**
 * Frontmatter as flat key/value pairs.
 *
 * Deliberately not a YAML parser: skill frontmatter in practice is a handful of
 * scalars, and pulling in a parser to read `name:` would be the larger mistake.
 *
 * Two shapes are handled beyond a plain scalar, because both appear in skills
 * people write and both were previously read wrong rather than refused:
 *
 *   - A block scalar (`description: |-` followed by indented lines) is folded
 *     into one line. Reading it as a scalar gave the literal `|-` as the
 *     description, which is not an error anywhere downstream — it is just the
 *     wrong text, which is why it went unnoticed.
 *   - A quoted value keeps its contents verbatim, including any colon, so a
 *     description may contain one.
 *
 * A line that is neither is skipped rather than guessed at.
 */
function parseFields(block: string): Map<string, string> {
  const fields = new Map<string, string>();
  const lines = block.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const separator = line.indexOf(":");
    if (separator <= 0 || line.startsWith("#") || line.startsWith(" ")) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;

    const raw = line.slice(separator + 1).trim();
    // A block header is `|` or `>`, optionally followed by a chomping indicator
    // (`-` strip, `+` keep, absent clip) and an indentation indicator (1-9), in
    // either order. Matching only `|` and `>` with a chomping character meant
    // `|2-` fell through to the scalar branch and the field was set to the
    // literal text `|2-` — the same shape of defect as the `|-` this was meant to
    // fix, one indicator further along.
    const blockMarker = /^([|>])(?:([1-9])([-+]?)|([-+]?)([1-9]?))?$/.exec(raw);
    if (blockMarker) {
      // The indentation indicator is accepted and not used: the common indent of
      // the lines below is measured from the body itself, which gives the same
      // answer whenever the document agrees with its own indicator and a usable
      // one when it does not.
      const keepTrailingNewlines = (blockMarker[3] ?? blockMarker[4]) === "+";
      // The indented lines below belong to this key. Their common indent is
      // stripped, and the marker decides whether the lines are joined with
      // spaces (`>`) or kept as written (`|`).
      const body: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && (lines[cursor]!.trim() === "" || /^\s/.test(lines[cursor]!))) {
        body.push(lines[cursor]!);
        cursor += 1;
      }
      index = cursor - 1;
      const indent = Math.min(
        ...body.filter((entry) => entry.trim() !== "").map((entry) => entry.length - entry.trimStart().length),
      );
      const stripped = body.map((entry) => entry.slice(Number.isFinite(indent) ? indent : 0));
      const joined = blockMarker[1] === ">"
        ? stripped.join(" ").replace(/\s+/g, " ").trim()
        : stripped.join("\n").trim();
      // `+` is the one chomping indicator that asks for the trailing line breaks
      // to survive; strip and clip both end at the last non-empty line, and a
      // metadata field is prose, so ending there is what a reader wants.
      fields.set(
        key,
        keepTrailingNewlines && blockMarker[1] === "|" ? `${stripped.join("\n").replace(/^\n+/, "").trimEnd()}\n` : joined,
      );
      continue;
    }

    fields.set(key, unquote(raw));
  }
  return fields;
}

/** A scalar with surrounding quotes removed, keeping what is inside them. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
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

  if (skill.unhonouredFields.length > 0) {
    // Reported because the author believes something is in force. A field the
    // format defines and this build ignores is a restriction that is not being
    // applied, which is worth a line; a field nobody defined is not.
    note(
      `declares ${skill.unhonouredFields.join(", ")}, which this build records but does not act on`,
    );
  }

  return diagnostics;
}
