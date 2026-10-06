import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { assertAdmission, type Admission } from '../network/admission.js';

/** The SDK escalates signals; this adapter also observes the final close event. */
export class McpStdioTransport extends StdioClientTransport {
  constructor(params: ConstructorParameters<typeof StdioClientTransport>[0], private readonly admission?: Admission) { super(params); }
  private closed = false;
  private observed!: () => void;
  private readonly exited = new Promise<void>((resolve) => { this.observed = resolve; });
  private closing?: Promise<void>;

  override async start(): Promise<void> {
    assertAdmission(this.admission);
    const onclose = this.onclose;
    this.onclose = () => {
      this.closed = true;
      this.observed();
      onclose?.();
    };
    await super.start();
  }

  override close(): Promise<void> {
    return this.closing ??= this.closeAndObserve();
  }

  private async closeAndObserve(): Promise<void> {
    const running = this.pid !== null;
    await super.close();
    if (!running || this.closed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.exited,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("MCP process exit was not observed after shutdown")), 1_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
