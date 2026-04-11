import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PolicyDecision } from './sandboxPolicy.js';
import type { EscalationResponse } from './escalationWorkflow.js';

export interface AuditEntry {
  timestamp: number;
  entryId: string;
  eventType: 'permission_check' | 'escalation_request' | 'escalation_decision' | 'policy_violation';
  toolName: string;
  operation: string;
  target: string;
  decision: string;
  policyRule?: string;
  reason: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogConfig {
  logFilePath: string;
  maxEntriesPerFile: number;
  rotateOnSize: boolean;
}

export class AuditTrail {
  private config: AuditLogConfig;
  private logStream: fs.WriteStream | null = null;
  private entryCount: number = 0;

  constructor(config?: Partial<AuditLogConfig>) {
    const defaultLogPath = path.join(
      process.cwd(),
      '.sisyphus',
      'audit',
      'permissions.jsonl'
    );

    this.config = {
      logFilePath: config?.logFilePath ?? defaultLogPath,
      maxEntriesPerFile: config?.maxEntriesPerFile ?? 10000,
      rotateOnSize: config?.rotateOnSize ?? true,
    };

    this.ensureLogDirectory();
    this.initializeLogStream();
  }

  logPermissionCheck(
    toolName: string,
    operation: string,
    target: string,
    policyDecision: PolicyDecision,
    sessionId?: string
  ): void {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      entryId: this.generateEntryId(),
      eventType: 'permission_check',
      toolName,
      operation,
      target,
      decision: policyDecision.allowed ? 'allow' : 'deny',
      policyRule: policyDecision.policyRule,
      reason: policyDecision.reason,
      sessionId,
    };

    this.writeEntry(entry);
  }

  logEscalationRequest(
    toolName: string,
    operation: string,
    target: string,
    policyDecision: PolicyDecision,
    promptId: string,
    sessionId?: string
  ): void {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      entryId: this.generateEntryId(),
      eventType: 'escalation_request',
      toolName,
      operation,
      target,
      decision: 'escalated',
      policyRule: policyDecision.policyRule,
      reason: policyDecision.reason,
      sessionId,
      metadata: { promptId },
    };

    this.writeEntry(entry);
  }

  logEscalationDecision(
    toolName: string,
    operation: string,
    target: string,
    response: EscalationResponse,
    sessionId?: string
  ): void {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      entryId: this.generateEntryId(),
      eventType: 'escalation_decision',
      toolName,
      operation,
      target,
      decision: response.decision,
      reason: response.userComment ?? `User ${response.decision} the escalated request`,
      sessionId,
      metadata: {
        promptId: response.promptId,
        respondedAt: response.respondedAt,
      },
    };

    this.writeEntry(entry);
  }

  logPolicyViolation(
    toolName: string,
    operation: string,
    target: string,
    violationType: string,
    details: string,
    sessionId?: string
  ): void {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      entryId: this.generateEntryId(),
      eventType: 'policy_violation',
      toolName,
      operation,
      target,
      decision: 'blocked',
      reason: details,
      sessionId,
      metadata: { violationType },
    };

    this.writeEntry(entry);
  }

  private writeEntry(entry: AuditEntry): void {
    if (!this.logStream) {
      console.error('Audit trail log stream not initialized');
      return;
    }

    const jsonLine = JSON.stringify(entry) + '\n';
    this.logStream.write(jsonLine);
    this.entryCount++;

    if (this.config.rotateOnSize && this.entryCount >= this.config.maxEntriesPerFile) {
      this.rotateLog();
    }
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.config.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private initializeLogStream(): void {
    this.logStream = fs.createWriteStream(this.config.logFilePath, { flags: 'a' });
    this.entryCount = this.countExistingEntries();
  }

  private countExistingEntries(): number {
    if (!fs.existsSync(this.config.logFilePath)) {
      return 0;
    }

    try {
      const content = fs.readFileSync(this.config.logFilePath, 'utf-8');
      return content.split('\n').filter(line => line.trim().length > 0).length;
    } catch (error) {
      console.warn(`Failed to count audit entries in ${this.config.logFilePath}: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  private rotateLog(): void {
    if (this.logStream) {
      this.logStream.end();
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = this.config.logFilePath.replace(/\.jsonl$/, `-${timestamp}.jsonl`);
    
    if (fs.existsSync(this.config.logFilePath)) {
      fs.renameSync(this.config.logFilePath, rotatedPath);
    }

    this.initializeLogStream();
    this.entryCount = 0;
  }

  private generateEntryId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  getRecentEntries(limit: number = 100): AuditEntry[] {
    if (!fs.existsSync(this.config.logFilePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.config.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const recentLines = lines.slice(-limit);
      
      return recentLines
        .map(line => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch (error) {
            console.warn(`Skipping invalid audit log line: ${error instanceof Error ? error.message : String(error)}`);
            return null;
          }
        })
        .filter((entry): entry is AuditEntry => entry !== null);
    } catch (error) {
      console.warn(`Failed to read audit log ${this.config.logFilePath}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  queryEntries(filter: Partial<AuditEntry>): AuditEntry[] {
    const allEntries = this.getRecentEntries(this.config.maxEntriesPerFile);
    
    return allEntries.filter(entry => {
      return Object.entries(filter).every(([key, value]) => {
        return entry[key as keyof AuditEntry] === value;
      });
    });
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  getLogFilePath(): string {
    return this.config.logFilePath;
  }
}
