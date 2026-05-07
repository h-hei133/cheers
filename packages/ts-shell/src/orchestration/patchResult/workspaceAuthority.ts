import fs from "node:fs";
import path from "node:path";

export type WorkspaceWriteTargetAuthority =
  | {
      readonly ok: true;
      readonly absolutePath: string;
      readonly realPath: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "path-outside-workspace"
        | "target-missing"
        | "target-symlink"
        | "target-not-file"
        | "realpath-outside-workspace"
        | "filesystem-error";
      readonly message: string;
      readonly evidence: readonly string[];
    };

export interface WorkspaceWriteAuthority {
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly writeFile: (relativePath: string, content: string) => void;
}

export function createWorkspaceWriteAuthority(
  workspaceRootInput: string,
): WorkspaceWriteAuthority {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const realWorkspaceRoot = fs.realpathSync(workspaceRoot);

  const validateWriteTarget = (
    relativePath: string,
  ): WorkspaceWriteTargetAuthority => {
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    if (!pathStaysInsideWorkspace(workspaceRoot, absolutePath)) {
      return authorityFailure(
        "path-outside-workspace",
        "Refuse to write outside the selected workspace.",
      );
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      return authorityFailure(
        isMissingFileError(error) ? "target-missing" : "filesystem-error",
        isMissingFileError(error)
          ? "Refuse to write because the selected workspace target is missing."
          : "Refuse to write because the selected workspace target could not be inspected.",
      );
    }

    if (stat.isSymbolicLink()) {
      return authorityFailure(
        "target-symlink",
        "Refuse to write through a symlink target in the selected workspace.",
      );
    }
    if (!stat.isFile()) {
      return authorityFailure(
        "target-not-file",
        "Refuse to write because the selected workspace target is not a regular file.",
      );
    }

    let realPath: string;
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch {
      return authorityFailure(
        "filesystem-error",
        "Refuse to write because the selected workspace target real path could not be resolved.",
      );
    }

    if (!pathStaysInsideWorkspace(realWorkspaceRoot, realPath)) {
      return authorityFailure(
        "realpath-outside-workspace",
        "Refuse to write because the selected workspace target resolves outside the workspace.",
      );
    }

    return { ok: true, absolutePath, realPath };
  };

  return {
    readFile: (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!pathStaysInsideWorkspace(workspaceRoot, resolved)) {
        return undefined;
      }
      try {
        const realPath = fs.realpathSync(resolved);
        if (!pathStaysInsideWorkspace(realWorkspaceRoot, realPath)) {
          return undefined;
        }
        return fs.readFileSync(realPath, "utf8");
      } catch {
        return undefined;
      }
    },
    readVerifiedFile: (relativePath) => {
      const target = validateWriteTarget(relativePath);
      if (target.ok === false) {
        return undefined;
      }
      try {
        return fs.readFileSync(target.realPath, "utf8");
      } catch {
        return undefined;
      }
    },
    validateWriteTarget,
    writeFile: (relativePath, content) => {
      const target = validateWriteTarget(relativePath);
      if (target.ok === false) {
        throw new Error(target.message);
      }
      fs.writeFileSync(target.realPath, content, "utf8");
    },
  };
}

function authorityFailure(
  reason: Extract<WorkspaceWriteTargetAuthority, { ok: false }>["reason"],
  message: string,
): Extract<WorkspaceWriteTargetAuthority, { ok: false }> {
  return {
    ok: false,
    reason,
    message,
    evidence: [
      "apply-patch-workspace-authority:blocked",
      `apply-patch-workspace-authority:${reason}`,
    ],
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  absolutePath: string,
): boolean {
  const relative = path.relative(workspaceRoot, absolutePath);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}
