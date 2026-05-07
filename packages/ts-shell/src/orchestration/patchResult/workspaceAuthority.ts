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
        | "descriptor-outside-workspace"
        | "descriptor-not-file"
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
  const noFollowFlag = fs.constants.O_NOFOLLOW ?? 0;

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
        const relativePath = path.relative(workspaceRoot, resolved);
        const handle = openVerifiedFile(relativePath, fs.constants.O_RDONLY);
        if (handle.ok === false) {
          return undefined;
        }
        try {
          return fs.readFileSync(handle.fd, "utf8");
        } finally {
          fs.closeSync(handle.fd);
        }
      } catch {
        return undefined;
      }
    },
    readVerifiedFile: (relativePath) => {
      const handle = openVerifiedFile(relativePath, fs.constants.O_RDONLY);
      if (handle.ok === false) {
        return undefined;
      }
      try {
        return fs.readFileSync(handle.fd, "utf8");
      } catch {
        return undefined;
      } finally {
        fs.closeSync(handle.fd);
      }
    },
    validateWriteTarget,
    writeFile: (relativePath, content) => {
      const handle = openVerifiedFile(relativePath, fs.constants.O_WRONLY);
      if (handle.ok === false) {
        throw new Error(handle.failure.message);
      }
      try {
        fs.ftruncateSync(handle.fd, 0);
        fs.writeFileSync(handle.fd, content, { encoding: "utf8" });
      } finally {
        fs.closeSync(handle.fd);
      }
    },
  };

  function openVerifiedFile(
    relativePath: string,
    flags: number,
  ):
    | { readonly ok: true; readonly fd: number }
    | {
        readonly ok: false;
        readonly failure: Extract<WorkspaceWriteTargetAuthority, { ok: false }>;
      } {
    const target = validateWriteTarget(relativePath);
    if (target.ok === false) {
      return { ok: false, failure: target };
    }

    let fd: number;
    try {
      fd = fs.openSync(target.absolutePath, flags | noFollowFlag);
    } catch (error) {
      return {
        ok: false,
        failure: authorityFailure(
          isSymlinkOpenError(error) ? "target-symlink" : "filesystem-error",
          isSymlinkOpenError(error)
            ? "Refuse to write through a symlink target in the selected workspace."
            : "Refuse to write because the selected workspace target could not be opened safely.",
        ),
      };
    }

    const descriptorFailure = verifyOpenedDescriptor(fd);
    if (descriptorFailure) {
      fs.closeSync(fd);
      return { ok: false, failure: descriptorFailure };
    }

    return { ok: true, fd };
  }

  function verifyOpenedDescriptor(
    fd: number,
  ): Extract<WorkspaceWriteTargetAuthority, { ok: false }> | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.fstatSync(fd);
    } catch {
      return authorityFailure(
        "filesystem-error",
        "Refuse to write because the selected workspace target descriptor could not be inspected.",
      );
    }

    if (!stat.isFile()) {
      return authorityFailure(
        "descriptor-not-file",
        "Refuse to write because the selected workspace target descriptor is not a regular file.",
      );
    }

    const descriptorRealPath = realpathForOpenDescriptor(fd);
    if (!descriptorRealPath) {
      return authorityFailure(
        "filesystem-error",
        "Refuse to write because the selected workspace target descriptor real path could not be resolved.",
      );
    }

    if (!pathStaysInsideWorkspace(realWorkspaceRoot, descriptorRealPath)) {
      return authorityFailure(
        "descriptor-outside-workspace",
        "Refuse to write because the opened selected workspace target resolves outside the workspace.",
      );
    }

    return undefined;
  }
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

function isSymlinkOpenError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ELOOP"
  );
}

function realpathForOpenDescriptor(fd: number): string | undefined {
  try {
    return fs.realpathSync(`/proc/self/fd/${fd}`);
  } catch {
    return undefined;
  }
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
