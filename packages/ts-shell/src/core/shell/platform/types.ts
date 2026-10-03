/**
 * Cross-Platform Shell Execution Types & Contracts
 * Manages OS platform detection, shell backend discovery (POSIX bash, Git Bash, PowerShell, WSL),
 * and dynamic execution routing.
 */

export type PlatformKind = "linux" | "darwin" | "win32";

export type ShellBackendKind = "bash" | "git-bash" | "powershell" | "wsl" | "auto";

export interface DetectedShell {
  readonly kind: ShellBackendKind;
  readonly executablePath: string;
  readonly isAvailable: boolean;
  readonly isDefault: boolean;
  readonly version?: string;
}

export interface PlatformEnvironment {
  readonly platform: PlatformKind;
  readonly arch: string;
  readonly activeBackend: ShellBackendKind;
  readonly detectedShells: readonly DetectedShell[];
  readonly executionPath: string;
  /** The executable exists and is launchable; this does not prove a WSL distro or command succeeds. */
  readonly isAvailable: boolean;
  readonly isPosixCompatible: boolean;
  readonly isAutoDetected: boolean;
}
