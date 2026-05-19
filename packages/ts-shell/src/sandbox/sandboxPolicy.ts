import path from 'node:path';

/**
 * Sandbox Policy - Default-deny permission enforcement for TS execution path
 * 
 * Implements T5 requirements:
 * - Default-deny for out-of-workspace filesystem operations
 * - Default-deny for network operations
 * - Default-deny for process spawn operations
 * - Explicit escalation workflow required for denied operations
 */

export type PermissionScope = 'filesystem' | 'network' | 'process' | 'system';

export type FileSystemOperation = 'read' | 'write' | 'delete' | 'execute';

export interface PermissionCheck {
  scope: PermissionScope;
  operation: string;
  target: string;
  workspaceRoot?: string;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requiresEscalation: boolean;
  policyRule?: string;
}

/**
 * Core sandbox policy enforcer - default deny for operations outside workspace
 */
export class SandboxPolicy {
  private workspaceRoot: string;
  private allowedNetworkHosts: Set<string> = new Set();
  
  constructor(workspaceRoot: string) {
    this.workspaceRoot = this.normalizePath(workspaceRoot);
  }

  /**
   * Check if a filesystem operation should be allowed
   */
  checkFilesystemPermission(
    operation: FileSystemOperation,
    targetPath: string
  ): PolicyDecision {
    const normalizedTarget = this.normalizePath(targetPath);
    
    // Default deny: check if target is within workspace
    if (!this.isWithinWorkspace(normalizedTarget)) {
      return {
        allowed: false,
        reason: `Filesystem ${operation} outside workspace: ${targetPath}`,
        requiresEscalation: true,
        policyRule: 'default-deny-out-of-workspace',
      };
    }

    // Additional restrictions for write/delete/execute
    if (operation === 'write' || operation === 'delete' || operation === 'execute') {
      // Check for sensitive paths within workspace
      if (this.isSensitivePath(normalizedTarget)) {
        return {
          allowed: false,
          reason: `${operation} operation on sensitive path: ${targetPath}`,
          requiresEscalation: true,
          policyRule: 'sensitive-path-protection',
        };
      }
    }

    // Allow operation within workspace
    return {
      allowed: true,
      reason: `${operation} within workspace boundary`,
      requiresEscalation: false,
    };
  }

  /**
   * Check if a network operation should be allowed
   */
  checkNetworkPermission(
    operation: string,
    target: string
  ): PolicyDecision {
    // Default deny all network operations
    // Escalation required for any network access
    return {
      allowed: false,
      reason: `Network ${operation} to ${target} blocked by default`,
      requiresEscalation: true,
      policyRule: 'default-deny-network',
    };
  }

  /**
   * Check if a process spawn operation should be allowed
   */
  checkProcessPermission(
    command: string,
    args: string[]
  ): PolicyDecision {
    // Default deny process spawning
    // Only allow if command is within workspace or on explicit allowlist
    if (this.isBareCommand(command)) {
      return {
        allowed: false,
        reason: `Process spawn outside workspace: ${command}`,
        requiresEscalation: true,
        policyRule: 'default-deny-process-spawn',
      };
    }

    const commandPath = this.normalizePath(command);
    
    if (!this.isWithinWorkspace(commandPath)) {
      return {
        allowed: false,
        reason: `Process spawn outside workspace: ${command}`,
        requiresEscalation: true,
        policyRule: 'default-deny-process-spawn',
      };
    }

    return {
      allowed: true,
      reason: `Process spawn within workspace boundary`,
      requiresEscalation: false,
    };
  }

  /**
   * General permission check dispatcher
   */
  checkPermission(check: PermissionCheck): PolicyDecision {
    switch (check.scope) {
      case 'filesystem': {
        // Parse operation from string like "write", "read", etc.
        const operation = check.operation as FileSystemOperation;
        return this.checkFilesystemPermission(operation, check.target);
      }
      case 'network':
        return this.checkNetworkPermission(check.operation, check.target);
      case 'process': {
        // Parse command and args from target
        const parts = check.target.split(' ');
        const command = parts[0];
        const args = parts.slice(1);
        return this.checkProcessPermission(command, args);
      }
      case 'system':
        // System operations always require escalation
        return {
          allowed: false,
          reason: `System operation ${check.operation} requires explicit approval`,
          requiresEscalation: true,
          policyRule: 'default-deny-system',
        };
      default:
        return {
          allowed: false,
          reason: `Unknown permission scope: ${check.scope}`,
          requiresEscalation: true,
          policyRule: 'unknown-scope',
        };
    }
  }

  /**
   * Normalize path for consistent comparison (Windows-aware)
   */
  private normalizePath(inputPath: string): string {
    const resolved = path.resolve(inputPath).replace(/\\/g, '/');
    // Convert to lowercase on Windows for case-insensitive comparison
    if (process.platform === 'win32') {
      return resolved.toLowerCase();
    }
    return resolved;
  }

  private isBareCommand(command: string): boolean {
    const trimmed = command.trim();
    return (
      trimmed.length > 0 &&
      !path.isAbsolute(trimmed) &&
      !trimmed.includes('/') &&
      !trimmed.includes('\\') &&
      !/^[A-Za-z]:/.test(trimmed)
    );
  }

  /**
   * Check if a path is within the workspace boundary
   */
  private isWithinWorkspace(normalizedPath: string): boolean {
    if (normalizedPath === this.workspaceRoot) {
      return true;
    }

    const workspaceWithSeparator = this.workspaceRoot.endsWith('/')
      ? this.workspaceRoot
      : `${this.workspaceRoot}/`;
    return normalizedPath.startsWith(workspaceWithSeparator);
  }

  /**
   * Check if a path is considered sensitive (e.g., .git/, .env, config files)
   */
  private isSensitivePath(normalizedPath: string): boolean {
    const sensitivePatterns = [
      '/.git/',
      '/.env',
      '/.ssh/',
      '/id_rsa',
      '/id_ed25519',
      '.key',
      '.pem',
      'credentials',
      'secrets',
    ];

    return sensitivePatterns.some(pattern => 
      normalizedPath.includes(pattern.toLowerCase())
    );
  }

  /**
   * Get the current workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Add an allowed network host (for testing or specific use cases)
   */
  allowNetworkHost(host: string): void {
    this.allowedNetworkHosts.add(host);
  }
}
