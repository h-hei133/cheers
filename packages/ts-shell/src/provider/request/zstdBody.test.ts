import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { compressZstdSync, decodedBody, supportsZstd } from "./body.js";

async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("zstd compression and response decoding", () => {
  it("reports zstd support consistently with compressZstdSync", () => {
    const supported = supportsZstd();
    expect(typeof supported).toBe("boolean");
    if (supported) {
      const payload = Buffer.from('{"hello":"zstd-world"}', "utf8");
      const compressed = compressZstdSync(payload);
      expect(compressed).toBeDefined();
      expect(compressed!.length).toBeGreaterThan(0);
    } else {
      expect(compressZstdSync(Buffer.from("x"))).toBeUndefined();
    }
  });

  it("round-trips zstd response bodies in decodedBody when runtime supports zstd", async () => {
    if (!supportsZstd()) return;
    const text = '{"ok":true,"msg":"compressed payload"}';
    const compressed = compressZstdSync(Buffer.from(text, "utf8"))!;
    const out = decodedBody(
      Readable.from([compressed]),
      new Headers({ "content-encoding": "zstd" }),
      new AbortController().signal,
    );
    expect(await readStreamText(out)).toBe(text);
  });

  it("rejects excessive chained content encodings", () => {
    expect(() =>
      decodedBody(
        Readable.from([]),
        new Headers({ "content-encoding": "gzip, gzip, gzip, gzip, gzip, gzip" }),
        new AbortController().signal,
      ),
    ).toThrow(/Too many response content encodings/);
  });
});
