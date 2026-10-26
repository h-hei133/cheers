import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";

/** Parent transport observations; a model label never identifies the early editor. */
export class StartupObservation {
  output = "";
  firstByteAt;
  firstFrameAt;
  inputAnnouncementAt;
  firstReplyAt;
  #decoders = new Map();

  constructor(mode) { this.mode = mode; }

  feed(stream, chunk, at) {
    const decoder = this.#decoders.get(stream) ?? new StringDecoder("utf8");
    this.#decoders.set(stream, decoder);
    if (chunk.length && this.firstByteAt === undefined) this.firstByteAt = at;
    this.output += decoder.write(chunk);
    if (this.output.length > 2 * 1024 * 1024) throw new Error("startup observation exceeded its output limit");
    const text = stripVTControlCharacters(this.output);
    const terminal = this.mode === "regular" || this.mode === "fullscreen";
    const frame = terminal ? text.includes("❯ Loading · type a draft") && text.includes("Loading runtime")
      : this.mode === "line" && text.includes("Cheers Shell");
    if (frame && this.firstFrameAt === undefined) this.firstFrameAt = at;
    const announcement = this.mode === "line" ? "waiting for newline-delimited prompts."
      : terminal ? "Ask anything, or / for commands" : undefined;
    if (announcement && text.includes(announcement) && this.inputAnnouncementAt === undefined) this.inputAnnouncementAt = at;
    if (text.includes("Synthetic reply:") && this.firstReplyAt === undefined) this.firstReplyAt = at;
  }
}

/** Validate distinct early rendering, runtime construction, adoption and write events. */
export function terminalStartupTimes(marks) {
  const read = label => {
    const matches = marks.filter(mark => mark.label === label);
    if (matches.length !== 1 || !Number.isFinite(matches[0].elapsedMs) || matches[0].elapsedMs < 0) {
      throw new Error(`terminal timing requires one valid ${label} mark`);
    }
    return matches[0].elapsedMs;
  };
  const times = {
    inputListenerReadyProcessMs: read("input listener ready"),
    firstFrameLayoutProcessMs: read("first frame layout"),
    firstFrameWriteProcessMs: read("first frame write completed"),
    runtimeReadyProcessMs: read("runtime ready"),
    runtimeInputAdoptedProcessMs: read("runtime input adopted"),
    runtimeFrameWriteProcessMs: read("runtime frame write completed"),
  };
  const ordered = Object.values(times);
  if (ordered.some((value, index) => index > 0 && value < ordered[index - 1])) {
    throw new Error("terminal startup events are out of lifecycle order");
  }
  return times;
}

/** Measure a rendered key, excluding unrelated output and split UTF-8 bytes. */
export function renderedKeyAfter(stdout, action, key, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const decoder = new StringDecoder("utf8");
    let output = "";
    const cleanup = () => {
      clearTimeout(timer);
      stdout.off("data", onData);
      stdout.off("end", onEnd);
    };
    const onData = chunk => {
      output += decoder.write(chunk);
      if (!stripVTControlCharacters(output).includes(key)) return;
      cleanup();
      resolve(performance.now() - started);
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("stdout ended before rendered key response"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("rendered key response timed out"));
    }, timeoutMs);
    stdout.on("data", onData);
    stdout.once("end", onEnd);
    try { action(); } catch (error) { cleanup(); reject(error); }
  });
}
