import type { CommandExecutionResult } from '../../../runtime/execution/types.js';
import type { CommandOutputCapture, CommandOutputView } from '../../../runtime/execution/output/capture.js';
import { ArtifactManager } from '../../session/artifactManager.js';
import { OutputAccumulator } from '../outputAccumulator.js';
import { approvedResult, deniedResult } from '../toolResultLifecycle.js';

interface OutputPart {
  readonly stream?: CommandOutputView;
  readonly tail: string;
  readonly bytes: number;
  readonly newlines: number;
  readonly truncated: boolean;
  readonly boundary: boolean;
}

function selectOutput(result: CommandExecutionResult, capture: CommandOutputCapture, combinedOutput = false): OutputPart[] {
  const part = (stream: CommandOutputView): OutputPart => {
    const snapshot = capture.snapshot(stream);
    if (snapshot.totalRawBytes > 0) return { stream, tail: snapshot.tail, bytes: snapshot.totalBytes,
      newlines: snapshot.totalNewlines, truncated: snapshot.truncated, boundary: snapshot.tailStartsAtLineBoundary };
    return textPart(stream === 'combined' ? [result.stdout, result.stderr].filter(Boolean).join('\n') : result[stream]);
  };
  const successful = result.status === 'completed' && result.exitCode === 0;
  const selected = (combinedOutput ? [part('combined')] : successful ? [part('stdout')] : [part('stderr'), part('stdout')]).filter(value => value.bytes > 0);
  return selected.length ? selected : [textPart(successful ? 'Command completed with no output'
    : result.recoveryReason || `Command failed with exit code ${result.exitCode}`)];
}

function textPart(text: string): OutputPart {
  let newlines = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) newlines++;
  return { tail: text, bytes: Buffer.byteLength(text), newlines, truncated: false, boundary: true };
}

async function* fullOutput(parts: readonly OutputPart[], capture: CommandOutputCapture): AsyncIterable<Uint8Array> {
  for (let index = 0; index < parts.length; index++) {
    if (index) yield Buffer.from('\n');
    const part = parts[index]!;
    if (part.stream) yield* capture.source(part.stream);
    else yield Buffer.from(part.tail);
  }
}

/** The result owns only a bounded text projection; the artifact owns the full streams. */
export async function commandOutputResult(result: CommandExecutionResult, capture: CommandOutputCapture,
  manager: ArtifactManager, notices: readonly string[] = [], options: { readonly combinedOutput?: boolean } = {}) {
  const parts = selectOutput(result, capture, options.combinedOutput);
  // Once a later stream has overflowed, its retained tail already exceeds the
  // display budget. Joining an earlier tail would invent a continuous prefix.
  let first = 0;
  for (let index = 0; index < parts.length; index++) if (parts[index]!.truncated) first = index;
  const accumulator = new OutputAccumulator({ maxBytes: 50 * 1024, maxLines: 2000 });
  for (let index = first; index < parts.length; index++) {
    if (index > first) accumulator.append('\n');
    const part = parts[index]!;
    const newline = part.tail.indexOf('\n');
    accumulator.append(index === first && !part.boundary && newline !== -1 ? part.tail.slice(newline + 1) : part.tail);
  }
  accumulator.finish();
  const preview = accumulator.snapshot().truncation;
  const originalBytes = parts.reduce((total, part) => total + part.bytes, parts.length - 1);
  const originalLines = parts.reduce((total, part) => total + part.newlines, parts.length);
  const truncated = preview.truncated || parts.some(part => part.truncated);
  const outputNotices = notices.map(notice => `[sandbox] ${notice}`);
  let cleanupUnknown = false;
  let outputArtifact: string | undefined;
  if (truncated && capture.complete) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 30_000);
    deadline.unref?.();
    try {
      const artifact = await manager.saveStream(fullOutput(parts, capture), 'bash', controller.signal);
      outputArtifact = artifact.uri;
      outputNotices.push(`[Showing last ${preview.shownLines} of ${originalLines} lines (${Math.round(preview.shownBytes / 1024)}KB of ${Math.round(originalBytes / 1024)}KB). Full text output saved: ${artifact.uri}]\n[To read full or earlier sections: read(path="${artifact.uri}:1-500")]`);
    } catch {
      outputNotices.push('[Output truncated; complete output could not be saved.]');
    } finally { clearTimeout(deadline); }
  } else if (!capture.complete) outputNotices.push('[Output capture incomplete; complete output is unavailable.]');
  try { await capture.dispose(); } catch { cleanupUnknown = true; }
  cleanupUnknown = (await manager.retryCleanup()) === 'unknown' || cleanupUnknown;
  if (cleanupUnknown) outputNotices.push('[Temporary output cleanup remains unconfirmed.]');
  const outputNotice = outputNotices.join('\n');
  const output = [preview.content, outputNotice].filter(Boolean).join('\n\n');
  const metadata = { executionPath: result.executionPath, errorClass: result.errorClass,
    status: result.status, exitCode: result.exitCode, truncated, ...(outputArtifact ? { outputArtifact } : {}), ...(outputNotice ? { outputNotice } : {}),
    ...(!capture.complete ? { outputComplete: false } : {}), ...(cleanupUnknown ? { outputCleanup: 'unknown' } : {}) };
  if (result.status === 'completed' && result.exitCode === 0) return approvedResult(output, metadata);
  return deniedResult(output, { ...metadata, failureKind: result.failureKind
    ?? (result.status === 'timeout' ? 'timeout' : result.status === 'cancelled' ? 'cancelled' : 'execution_failure'),
    recoveryReason: result.recoveryReason });
}
