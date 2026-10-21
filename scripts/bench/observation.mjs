import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";

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
