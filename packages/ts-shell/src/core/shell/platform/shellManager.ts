import type { PlatformEnvironment, ShellBackendKind } from "./types.js";
import { ShellDetector } from "./shellDetector.js";

/**
 * Shell Manager
 * Tracks and controls the active execution shell backend for the agent session.
 */
export class ShellManager {
  private static forcedBackend: ShellBackendKind = "auto";

  public static getActiveEnvironment(): PlatformEnvironment {
    return ShellDetector.detectEnvironment(this.forcedBackend);
  }

  public static setBackend(backend: ShellBackendKind): PlatformEnvironment {
    this.forcedBackend = backend;
    return this.getActiveEnvironment();
  }

  public static resetToAuto(): PlatformEnvironment {
    this.forcedBackend = "auto";
    return this.getActiveEnvironment();
  }

  public static formatStatusReport(): string {
    const env = this.getActiveEnvironment();
    const lines: string[] = [
      "# Cross-Platform Shell Environment Diagnostics",
      "",
      `**Host Platform**: \`${env.platform}\` (${env.arch})`,
      `**Active Shell Backend**: \`${env.activeBackend}\` ${env.isAutoDetected ? "*(auto-detected)*" : "*(manually configured)*"}`,
      `**Executable Path**: \`${env.executionPath}\``,
      `**POSIX Compatibility Mode**: ${env.isPosixCompatible ? "🟢 POSIX Compliant" : "🟡 PowerShell / Native Windows"}`,
      "",
      "### Detected Shell Backends:",
    ];

    env.detectedShells.forEach((s, idx) => {
      const isCurrent = s.kind === env.activeBackend;
      const statusTag = s.isAvailable ? (isCurrent ? "🟢 [ACTIVE]" : "⚪ [AVAILABLE]") : "❌ [NOT FOUND]";
      lines.push(`${idx + 1}. \`${s.kind}\` ${statusTag}`);
      lines.push(`   - Path: \`${s.executablePath}\``);
    });

    lines.push(
      "",
      "Commands:",
      "- `/shell use <bash|git-bash|powershell|wsl>` : Switch active shell backend",
      "- `/shell auto` : Reset to automatic platform detection",
    );

    return lines.join("\n");
  }
}
