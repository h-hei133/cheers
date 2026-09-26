import { describe, expect, it } from "vitest";
import { crc32, decodeMessage, EventStreamError, readEventStream } from "./eventStream.js";

/**
 * The binary framing, exercised with frames this file builds.
 *
 * The format is counted rather than delimited, so the interesting cases are the
 * arithmetic ones: a header whose value width depends on its type, a frame that
 * arrives in two pieces, several frames in one piece, and a frame whose checksum
 * does not match. Building the frames here is what makes those cases expressible.
 */

/** A frame with the given headers and payload, checksums computed. */
function frame(headers: ReadonlyArray<readonly [string, number, number[]]>, payload: number[]): Uint8Array {
  const encoder = new TextEncoder();
  const headerBytes: number[] = [];
  for (const [name, type, value] of headers) {
    const nameBytes = encoder.encode(name);
    headerBytes.push(nameBytes.length, ...nameBytes, type, ...value);
  }
  const total = 12 + headerBytes.length + payload.length + 4;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, total, false);
  view.setUint32(4, headerBytes.length, false);
  view.setUint32(8, crc32(bytes.subarray(0, 8)), false);
  bytes.set(headerBytes, 12);
  bytes.set(payload, 12 + headerBytes.length);
  view.setUint32(total - 4, crc32(bytes.subarray(0, total - 4)), false);
  return bytes;
}

/** A UTF-8 string header, which is what the protocol mostly uses. */
function text(name: string, value: string): readonly [string, number, number[]] {
  const bytes = [...new TextEncoder().encode(value)];
  return [name, 7, [bytes.length >> 8, bytes.length & 0xff, ...bytes]];
}

/** A byte-array header, the type the protocol reserves for binary values. */
function binary(name: string, bytes: number[]): readonly [string, number, number[]] {
  return [name, 6, [bytes.length >> 8, bytes.length & 0xff, ...bytes]];
}

describe("the checksum", () => {
  it("matches the standard check value", () => {
    // Every CRC-32 implementation is expected to produce this for "123456789";
    // it is the value that says the polynomial and the reflection are right.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("decoding one message", () => {
  it("reads string headers and the payload", () => {
    const message = decodeMessage(frame([text(":event-type", "chunk"), text("other", "x")], [1, 2, 3]));

    expect(message.headers[":event-type"]).toBe("chunk");
    expect(message.headers.other).toBe("x");
    expect([...message.payload]).toEqual([1, 2, 3]);
  });

  it("reads the other value widths the format defines", () => {
    const message = decodeMessage(
      frame(
        [
          ["a", 0, []],
          ["b", 1, []],
          ["c", 2, [0xff]],
          ["d", 4, [0, 0, 1, 0]],
          ["e", 6, [0, 2, 9, 8]],
          ["f", 9, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]],
        ],
        [],
      ),
    );

    expect(message.headers.a).toBe("true");
    expect(message.headers.b).toBe("false");
    expect(message.headers.c).toBe("-1");
    expect(message.headers.d).toBe("256");
    expect(message.headers.e).toBe("CQg=");
    expect(message.headers.f).toBe("00010203-0405-0607-0809-0a0b0c0d0e0f");
  });

  it("refuses a frame whose declared length is not what arrived", () => {
    const bytes = frame([text("a", "b")], []);
    bytes[3] = 99;

    expect(() => decodeMessage(bytes)).toThrow(EventStreamError);
  });

  it("refuses a frame whose checksum does not match", () => {
    // The whole reason the checksums are there: a corrupted payload must not
    // become a plausible-looking event.
    const bytes = frame([text("a", "b")], [7]);
    bytes[bytes.length - 5] = 8;

    expect(() => decodeMessage(bytes)).toThrow(/checksum/);
  });

  it("refuses a frame too short to hold the framing", () => {
    expect(() => decodeMessage(new Uint8Array(10))).toThrow(/minimum/);
  });

  it("refuses an unknown header value type", () => {
    expect(() => decodeMessage(frame([["a", 42, []]], []))).toThrow(/unknown header value type/);
  });
});

describe("reading a stream", () => {
  /** A stream that yields the given chunks in order. */
  function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });
  }

  async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
    const seen: string[] = [];
    for await (const message of readEventStream(stream)) seen.push(message.headers[":event-type"] ?? "");
    return seen;
  }

  it("reads several messages from one chunk", async () => {
    const one = frame([text(":event-type", "first")], []);
    const two = frame([text(":event-type", "second")], []);
    const merged = new Uint8Array(one.length + two.length);
    merged.set(one);
    merged.set(two, one.length);

    expect(await collect(streamOf(merged))).toEqual(["first", "second"]);
  });

  it("reads a message split across chunks", async () => {
    // Chunk boundaries have nothing to do with message boundaries, and this is
    // the case that a delimiter-based reader gets wrong.
    const whole = frame([text(":event-type", "split")], [1, 2, 3]);

    expect(await collect(streamOf(whole.subarray(0, 5), whole.subarray(5)))).toEqual(["split"]);
  });

  it("reads a message split at every possible point", async () => {
    const whole = frame([text(":event-type", "byte-by-byte")], [9]);
    const pieces = [...whole].map((byte) => new Uint8Array([byte]));

    expect(await collect(streamOf(...pieces))).toEqual(["byte-by-byte"]);
  });

  it("refuses a stream that ends mid-message", async () => {
    const whole = frame([text(":event-type", "cut")], []);

    await expect(collect(streamOf(whole.subarray(0, whole.length - 2)))).rejects.toThrow(/incomplete/);
  });

  it("refuses a frame whose declared length is below the minimum", async () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, 4, false);

    await expect(collect(streamOf(bytes))).rejects.toThrow(/below the minimum/);
  });
});

describe("a header whose value is raw bytes", () => {
  /**
   * It is carried as base64 text.
   *
   * The decoder surfaces every header as a string, so a byte-array header — the
   * type the protocol reserves for binary values — needs an encoding that
   * survives that. Reaching for a Node-only helper here would have thrown at
   * runtime, in the one branch the protocol's own streams happen not to use,
   * which is exactly the kind of breakage that waits for a third-party sender.
   */
  it("is readable as base64 text", () => {
    const message = frame([binary(":binary", [1, 2, 3])], []);

    expect(decodeMessage(message).headers[":binary"]).toBe("AQID");
  });

  it("handles bytes that are not valid UTF-8", () => {
    const message = frame([binary(":raw", [0xff, 0xfe, 0x00])], []);

    expect(decodeMessage(message).headers[":raw"]).toBe("//4A");
  });
});
