import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { userDataDirFor } from "../core/paths/userHome.js";

/**
 * OS-level isolation for shell commands.
 *
 * The policy layer checks tool arguments, which is the right place to decide
 * whether a command should run at all — but it cannot follow the command once it
 * has started. A shell that is allowed to run is allowed to read anything the user
 * can read, and to reach the network. Closing that needs the operating system:
 * `bwrap` on Linux, `sandbox-exec` on macOS.
 *
 * Off by default, because turning it on changes what commands can do and needs a
 * tool that may not be installed. When it is on and the tool is missing, the
 * command still runs — and says, on every command, that it ran unisolated, because
 * a silent fallback to no isolation is the one outcome nobody can act on.
 */

export interface SandboxRules {
  readonly enabled?: boolean;
  readonly network?: {
    /** Hosts the command may reach. An empty list denies all network. */
    readonly allowedDomains?: readonly string[];
  };
  readonly filesystem?: {
    /** Paths that stay readable; the workspace is always readable. */
    readonly allowRead?: readonly string[];
    /** Paths the command may write. Defaults to the workspace and a temp dir. */
    readonly allowWrite?: readonly string[];
    /** Paths hidden outright, whatever the rules above say. */
    readonly denyRead?: readonly string[];
  };
}

export type SandboxState = "off" | "isolated" | "unavailable";

export interface SandboxPlan {
  readonly state: SandboxState;
  /** Command and arguments to run instead, when isolation is in force. */
  readonly command?: string;
  readonly args?: readonly string[];
  /** What to tell the user, when there is something they need to know. */
  readonly notice?: string;
}

const CONFIG_NAME = "sandbox.json";
/** Paths never exposed, regardless of configuration. */
const ALWAYS_HIDDEN = [".ssh", ".aws", ".gnupg", ".private-agents-real"];

/**
 * The rules in force for `workspaceRoot`.
 *
 * A project's file may not relax what the user's file decided. The two are
 * combined rather than one chosen over the other, because a project that could
 * replace the user's rules could lift their isolation outright: a workspace file
 * saying `enabled: false`, or naming `/` as writable, would undo a decision its
 * author never made. The attack is cloning a repository, not mistyping a setting.
 *
 * Each field resolves in the direction that keeps authority with the user:
 *
 *   - Isolation can be requested by either file but switched off by neither, so
 *     a project may ask for confinement and may not remove it.
 *   - The path allowlists (`allowRead`, `allowWrite`) and the domain allowlist are
 *     permission grants, and a grant is the user's to make. When the user set one
 *     the project's is ignored; when they did not, the project's applies. Honouring
 *     a project's narrower list instead would mean reasoning about which paths
 *     contain which, and the failure mode of getting that wrong is silently
 *     widening the grant — the one outcome this must not have.
 *   - `denyRead` is a restriction, so it accumulates: a path either file refuses
 *     stays refused.
 *
 * A field the user never set is the project's to define, since there is no user
 * decision for it to contradict.
 */
export function readSandboxRules(workspaceRoot: string): SandboxRules {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  const userRules = readRulesFile(path.join(userDataDirFor(home), CONFIG_NAME));
  const projectRules = readRulesFile(path.join(workspaceRoot, ".agents", CONFIG_NAME));
  return tighten(userRules, projectRules);
}

/** The rules in one file, or none when it is absent or unreadable. */
function readRulesFile(configPath: string): SandboxRules | undefined {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as SandboxRules;
  } catch {
    // Absent, unreadable and malformed all mean the same thing here: this file
    // contributes no rules. A malformed file must not cost the other one.
    return undefined;
  }
}

/**
 * Apply `project` to `user` without letting the project widen anything.
 *
 * Absent sections are passed through, so a project file that says nothing about
 * the network leaves the user's network rules exactly as they were.
 */
function tighten(user: SandboxRules | undefined, project: SandboxRules | undefined): SandboxRules {
  if (!user) return project ?? {};
  if (!project) return user;

  // Built as a mutable shape because the fields are readonly on the published
  // type; the value is assembled once and never changed afterwards.
  const result: {
    enabled?: boolean
    network?: SandboxRules["network"]
    filesystem?: SandboxRules["filesystem"]
  } = {};

  // Isolation is the user's to switch off. A project can ask for it, which is the
  // tightening direction.
  const enabled = user.enabled === true || project.enabled === true;
  if (enabled) result.enabled = true;

  // A permission grant belongs to whoever asked for the confinement. When the
  // user turned isolation on, the grants are theirs even where they listed no
  // paths: not listing any means "the built-in default" (the workspace and a temp
  // directory), and a project naming `/` here would be replacing that default with
  // the whole filesystem — widening the decision rather than respecting it.
  const grantsComeFromProject = user.enabled !== true;

  const allowedDomains = grantsComeFromProject
    ? project.network?.allowedDomains ?? user.network?.allowedDomains
    : user.network?.allowedDomains;
  if (allowedDomains !== undefined) result.network = { allowedDomains };

  const filesystem = tightenFilesystem(user.filesystem, project.filesystem, grantsComeFromProject);
  if (filesystem) result.filesystem = filesystem;

  return result;
}

/** Path rules, in the direction that keeps authority with the user. */
function tightenFilesystem(
  user: SandboxRules["filesystem"],
  project: SandboxRules["filesystem"],
  grantsComeFromProject: boolean,
): SandboxRules["filesystem"] {
  // No user section: nothing to contradict, unless the user asked for isolation
  // and simply listed no paths — then their silence is the default, not a
  // delegation. Only the restriction carries over in that case.
  if (!user) {
    if (grantsComeFromProject) return project;
    return project?.denyRead === undefined ? undefined : { denyRead: project.denyRead };
  }
  if (!project) return user;

  const result: {
    allowRead?: readonly string[];
    allowWrite?: readonly string[];
    denyRead?: readonly string[];
  } = {};

  // Allowlists are grants, so they follow the same rule as the domain list: the
  // user's where the user asked for confinement, the project's otherwise.
  const allowRead = grantsComeFromProject
    ? project.allowRead ?? user.allowRead
    : user.allowRead;
  if (allowRead !== undefined) result.allowRead = allowRead;
  const allowWrite = grantsComeFromProject
    ? project.allowWrite ?? user.allowWrite
    : user.allowWrite;
  if (allowWrite !== undefined) result.allowWrite = allowWrite;

  // A denylist is a restriction and only accumulates: a path either file refuses
  // stays refused. A project cannot un-refuse what the user refused.
  const denyRead =
    user.denyRead === undefined
      ? project.denyRead
      : project.denyRead === undefined
        ? user.denyRead
        : [...new Set([...user.denyRead, ...project.denyRead])];
  if (denyRead !== undefined) result.denyRead = denyRead;

  return result;
}

/** Whether this platform has a sandbox launcher installed. */
export function sandboxLauncher(): { readonly kind: "bwrap" | "sandbox-exec"; readonly bin: string } | undefined {
  const candidates: { kind: "bwrap" | "sandbox-exec"; bin: string }[] =
    process.platform === "darwin"
      ? [{ kind: "sandbox-exec", bin: "sandbox-exec" }]
      : process.platform === "linux"
        ? [{ kind: "bwrap", bin: "bwrap" }]
        : [];
  for (const candidate of candidates) {
    const probe = spawnSync("command", ["-v", candidate.bin], { shell: true, encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim()) return candidate;
  }
  return undefined;
}

/**
 * How to run `command` under the rules in force.
 *
 * The three answers are kept apart on purpose: isolation is off, isolation is in
 * force, or isolation was asked for and could not be arranged. Only the second
 * means the command is contained.
 */
export function planSandboxedCommand(input: {
  readonly shell: string;
  readonly shellArgs: readonly string[];
  readonly workspaceRoot: string;
  readonly rules?: SandboxRules;
}): SandboxPlan {
  const rules = input.rules ?? readSandboxRules(input.workspaceRoot);
  if (rules.enabled !== true) return { state: "off" };
  const launcher = sandboxLauncher();
  if (!launcher) {
    return {
      state: "unavailable",
      notice:
        process.platform === "linux"
          ? "Ran WITHOUT isolation: the sandbox is enabled but `bwrap` is not installed."
          : process.platform === "darwin"
            ? "Ran WITHOUT isolation: the sandbox is enabled but `sandbox-exec` is unavailable."
            : `Ran WITHOUT isolation: no sandbox launcher exists for ${process.platform}.`,
    };
  }
  const args =
    launcher.kind === "bwrap"
      ? bwrapArgs(rules, input.workspaceRoot, input.shell, input.shellArgs)
      : seatbeltArgs(rules, input.workspaceRoot, input.shell, input.shellArgs);
  return { state: "isolated", command: launcher.bin, args };
}

/**
 * A bubblewrap invocation: a fresh namespace with nothing in it but what is
 * listed, the workspace writable, and the network detached unless a host was
 * allowed. Domain-level allowing is not something bubblewrap can express, so any
 * allowlist keeps the network attached and says so through {@link networkNotice}.
 */
function bwrapArgs(
  rules: SandboxRules,
  workspaceRoot: string,
  shell: string,
  shellArgs: readonly string[],
): string[] {
  const args = ["--die-with-parent", "--new-session", "--proc", "/proc", "--dev", "/dev"];
  for (const readable of ["/usr", "/bin", "/lib", "/lib64", "/etc", "/opt", ...(rules.filesystem?.allowRead ?? [])]) {
    if (fs.existsSync(readable)) args.push("--ro-bind", readable, readable);
  }
  args.push("--bind", workspaceRoot, workspaceRoot);
  for (const writable of rules.filesystem?.allowWrite ?? []) {
    if (fs.existsSync(writable)) args.push("--bind", writable, writable);
  }
  args.push("--tmpfs", "/tmp");
  for (const hidden of hiddenPaths(rules)) {
    if (fs.existsSync(hidden)) args.push("--tmpfs", hidden);
  }
  if ((rules.network?.allowedDomains ?? []).length === 0) args.push("--unshare-net");
  args.push("--chdir", workspaceRoot, shell, ...shellArgs);
  return args;
}

/** A seatbelt invocation: deny by default, then allow what the rules name. */
function seatbeltArgs(
  rules: SandboxRules,
  workspaceRoot: string,
  shell: string,
  shellArgs: readonly string[],
): string[] {
  const writable = [workspaceRoot, "/tmp", ...(rules.filesystem?.allowWrite ?? [])];
  const profile = [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    ...writable.map((target) => `(allow file-write* (subpath "${target}"))`),
    ...hiddenPaths(rules).map((target) => `(deny file-read* (subpath "${target}"))`),
    ...((rules.network?.allowedDomains ?? []).length === 0 ? ["(deny network*)"] : []),
  ].join("\n");
  return ["-p", profile, shell, ...shellArgs];
}

/** Paths hidden from the command: the configured ones plus the ones always hidden. */
function hiddenPaths(rules: SandboxRules): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return [
    ...ALWAYS_HIDDEN.map((name) => path.join(home, name)),
    ...(rules.filesystem?.denyRead ?? []).map((target) =>
      target.startsWith("~") ? path.join(home, target.slice(1)) : target,
    ),
  ];
}

/**
 * What to say about the network when a domain allowlist was configured.
 *
 * Neither launcher filters by hostname, so an allowlist cannot be honoured as
 * written. Saying that is the only correct option: quietly leaving the network
 * fully open while a config file lists two domains would be worse than no sandbox.
 */
export function networkNotice(rules: SandboxRules): string | undefined {
  const allowed = rules.network?.allowedDomains ?? [];
  if (allowed.length === 0) return undefined;
  return `Network is fully open: an allowlist of ${allowed.length} domain(s) is configured, but per-host filtering is not something the sandbox launcher can enforce.`;
}
