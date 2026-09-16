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

export type WorkspaceCreateTargetAuthority =
  | {
      readonly ok: true;
      readonly absolutePath: string;
      readonly parentRealPath: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "path-outside-workspace"
        | "target-exists"
        | "target-symlink"
        | "parent-missing"
        | "parent-symlink"
        | "parent-not-directory"
        | "parent-realpath-outside-workspace"
        | "filesystem-error";
      readonly message: string;
      readonly evidence: readonly string[];
    };

export interface WorkspaceWriteAuthority {
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string) => string | undefined;
  readonly directoryExists: (absolutePath: string) => boolean;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly writeFile: (relativePath: string, content: string) => void;
  readonly createFileExclusive: (relativePath: string, content: string) => void;
  readonly moveFileExclusive: (sourcePath: string, targetPath: string) => void;
  readonly deleteFile: (relativePath: string) => void;
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

  const validateCreateTarget = (
    relativePath: string,
  ): WorkspaceCreateTargetAuthority => {
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    if (!pathStaysInsideWorkspace(workspaceRoot, absolutePath)) {
      return createAuthorityFailure(
        "path-outside-workspace",
        "Refuse to create outside the selected workspace.",
      );
    }

    try {
      const targetStat = fs.lstatSync(absolutePath);
      if (targetStat.isSymbolicLink()) {
        return createAuthorityFailure(
          "target-symlink",
          "Refuse to create through a symlink target in the selected workspace.",
        );
      }
      return createAuthorityFailure(
        "target-exists",
        "Refuse to create because the selected workspace target already exists.",
      );
    } catch (error) {
      if (!isMissingFileError(error)) {
        return createAuthorityFailure(
          "filesystem-error",
          "Refuse to create because the selected workspace target could not be inspected.",
        );
      }
    }

    const parentPath = path.dirname(absolutePath);
    if (!pathStaysInsideOrIsWorkspace(workspaceRoot, parentPath)) {
      return createAuthorityFailure(
        "path-outside-workspace",
        "Refuse to create because the target parent is outside the selected workspace.",
      );
    }

    let parentStat: fs.Stats;
    try {
      parentStat = fs.lstatSync(parentPath);
    } catch (error) {
      return createAuthorityFailure(
        isMissingFileError(error) ? "parent-missing" : "filesystem-error",
        isMissingFileError(error)
          ? "Refuse to create because the selected workspace target parent is missing."
          : "Refuse to create because the selected workspace target parent could not be inspected.",
      );
    }

    if (parentStat.isSymbolicLink()) {
      return createAuthorityFailure(
        "parent-symlink",
        "Refuse to create because the selected workspace target parent is a symlink.",
      );
    }
    if (!parentStat.isDirectory()) {
      return createAuthorityFailure(
        "parent-not-directory",
        "Refuse to create because the selected workspace target parent is not a directory.",
      );
    }

    let parentRealPath: string;
    try {
      parentRealPath = fs.realpathSync(parentPath);
    } catch {
      return createAuthorityFailure(
        "filesystem-error",
        "Refuse to create because the selected workspace target parent real path could not be resolved.",
      );
    }

    if (!pathStaysInsideOrIsWorkspace(realWorkspaceRoot, parentRealPath)) {
      return createAuthorityFailure(
        "parent-realpath-outside-workspace",
        "Refuse to create because the selected workspace target parent resolves outside the workspace.",
      );
    }

    return { ok: true, absolutePath, parentRealPath };
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
    directoryExists: (absolutePath) => {
      const resolved = path.resolve(absolutePath);
      if (!pathStaysInsideOrIsWorkspace(workspaceRoot, resolved)) {
        return false;
      }
      try {
        const stat = fs.lstatSync(resolved);
        if (stat.isSymbolicLink()) {
          return false;
        }
        if (!stat.isDirectory()) {
          return false;
        }
        const realPath = fs.realpathSync(resolved);
        return pathStaysInsideOrIsWorkspace(realWorkspaceRoot, realPath);
      } catch {
        return false;
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
    validateCreateTarget,
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
    createFileExclusive: (relativePath, content) => {
      const target = validateCreateTarget(relativePath);
      if (target.ok === false) {
        throw new Error(target.message);
      }

      let fd: number;
      try {
        fd = fs.openSync(
          target.absolutePath,
          fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_WRONLY |
            noFollowFlag,
          0o666,
        );
      } catch (error) {
        throw new Error(
          isSymlinkOpenError(error)
            ? "Refuse to create through a symlink target in the selected workspace."
            : isFileExistsError(error)
              ? "Refuse to create because the selected workspace target already exists."
              : "Refuse to create because the selected workspace target could not be opened exclusively.",
        );
      }

      try {
        const descriptorFailure = verifyCreateDescriptor(fd);
        if (descriptorFailure) {
          throw new Error(descriptorFailure.message);
        }
        fs.writeFileSync(fd, content, { encoding: "utf8" });
      } finally {
        fs.closeSync(fd);
      }
    },
    moveFileExclusive: (sourcePath, targetPath) => {
      const source = validateWriteTarget(sourcePath);
      if (source.ok === false) {
        throw new Error(source.message);
      }
      const target = validateCreateTarget(targetPath);
      if (target.ok === false) {
        throw new Error(target.message);
      }

      try {
        fs.linkSync(source.absolutePath, target.absolutePath);
      } catch (error) {
        throw new Error(
          isFileExistsError(error)
            ? "Refuse to move because the selected workspace target already exists."
            : "Refuse to move because the selected workspace source could not be linked to the target.",
        );
      }

      try {
        fs.unlinkSync(source.absolutePath);
      } catch {
        // Leave the target in place and let route-level post-write verification
        // surface the partial move facts. Route 44 does not add rollback.
      }
    },
    deleteFile: (relativePath) => {
      const target = validateWriteTarget(relativePath);
      if (target.ok === false) {
        throw new Error(target.message);
      }

      try {
        fs.unlinkSync(target.absolutePath);
      } catch {
        throw new Error(
          "Refuse to delete because the selected workspace target could not be unlinked.",
        );
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

  function verifyCreateDescriptor(
    fd: number,
  ): Extract<WorkspaceCreateTargetAuthority, { ok: false }> | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.fstatSync(fd);
    } catch {
      return createAuthorityFailure(
        "filesystem-error",
        "Refuse to create because the selected workspace target descriptor could not be inspected.",
      );
    }

    if (!stat.isFile()) {
      return createAuthorityFailure(
        "filesystem-error",
        "Refuse to create because the selected workspace target descriptor is not a regular file.",
      );
    }

    const descriptorRealPath = realpathForOpenDescriptor(fd);
    if (!descriptorRealPath) {
      return createAuthorityFailure(
        "filesystem-error",
        "Refuse to create because the selected workspace target descriptor real path could not be resolved.",
      );
    }

    if (!pathStaysInsideWorkspace(realWorkspaceRoot, descriptorRealPath)) {
      return createAuthorityFailure(
        "path-outside-workspace",
        "Refuse to create because the opened selected workspace target resolves outside the workspace.",
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

function createAuthorityFailure(
  reason: Extract<WorkspaceCreateTargetAuthority, { ok: false }>["reason"],
  message: string,
): Extract<WorkspaceCreateTargetAuthority, { ok: false }> {
  return {
    ok: false,
    reason,
    message,
    evidence: [
      "apply-patch-workspace-create-authority:blocked",
      `apply-patch-workspace-create-authority:${reason}`,
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

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
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

function pathStaysInsideOrIsWorkspace(
  workspaceRoot: string,
  absolutePath: string,
): boolean {
  const relative = path.relative(workspaceRoot, absolutePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
