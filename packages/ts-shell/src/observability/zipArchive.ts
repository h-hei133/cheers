import { deflateRawSync, crc32 } from "node:zlib";

/**
 * A minimal ZIP writer, for the report archive.
 *
 * Hand-written rather than taken from a package: the archive needs one entry
 * shape and no compression choices, and the whole format is a header, the
 * deflated bytes, and a central directory. A dependency for that would be a
 * larger surface than the code it replaces, in a project that keeps its
 * dependency list short on purpose.
 *
 * Uses only `node:zlib`. `crc32` needs Node 20.15 or newer, which the package
 * declares in `engines`; before that the function did not exist and the report
 * would have failed at the moment someone needed it most.
 *
 * Only what is needed is implemented: stored sizes are known up front (entries
 * are built in memory), there are no zip64 extensions, and no directories are
 * emitted as entries. An archive over 4 GiB or with more than 65535 entries is
 * rejected rather than silently written as a corrupt file.
 */

export interface ZipEntry {
  readonly name: string;
  readonly data: string | Uint8Array;
}

/** MS-DOS date and time, which is what the format stores. */
function dosDateTime(date: Date): { readonly time: number; readonly date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    // Years before 1980 cannot be represented; the epoch of the format is 1980.
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;

/** Version 2.0: the minimum that supports deflate. */
const VERSION_NEEDED = 20;

/** Deflate with the maximum window size, which is what `deflateRawSync` emits. */
const METHOD_DEFLATE = 8;

const MAX_ENTRIES = 65_535;
const MAX_TOTAL_BYTES = 0xffff_ffff;

/**
 * Build a ZIP archive from the given entries.
 *
 * Throws when the archive would exceed the format's non-zip64 limits, rather than
 * producing a file that looks fine and cannot be opened.
 */
export function createZipArchive(entries: readonly ZipEntry[], now: Date = new Date()): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`A zip archive holds at most ${MAX_ENTRIES} entries; ${entries.length} were given.`);
  }
  const { time, date } = dosDateTime(now);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    // Deflate rather than store: report contents are text and compress well, and
    // a stored entry would make the archive larger than its own contents.
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    // Bit 11 marks the name as UTF-8, so a non-ASCII filename survives.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    central.writeUInt16LE(VERSION_NEEDED, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // Extra field, comment, disk number, internal and external attributes: all
    // zero, because nothing here needs them.
    central.writeUInt32LE(0, 30);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
    totalBytes += offset;
    if (offset > MAX_TOTAL_BYTES) {
      throw new Error("A zip archive without zip64 holds at most 4 GiB; this one does not.");
    }
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}
