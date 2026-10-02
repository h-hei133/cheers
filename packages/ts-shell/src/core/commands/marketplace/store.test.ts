import fs from "node:fs";
import { renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMarketplaceCommand } from "../marketplaceCommandRuntime.js";
import { getMarketplaceSources } from "./store.js";
import { sourcePicker } from "../../../cli/interactive/picker/sources.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

let directory: string;
let file: string;
let previous: string | undefined;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "marketplace-store-"));
  file = path.join(directory, "sources.json");
  previous = process.env.CHEERS_MARKETPLACES_FILE;
  process.env.CHEERS_MARKETPLACES_FILE = file;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (previous === undefined) delete process.env.CHEERS_MARKETPLACES_FILE;
  else process.env.CHEERS_MARKETPLACES_FILE = previous;
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("marketplace source storage", () => {
  it("reads fresh disk state and persists add/remove without implying a search service", async () => {
    expect(getMarketplaceSources()).toEqual([]);
    expect((await runMarketplaceCommand(["add", "one", "https://one.example"], {})).output).toContain("successfully registered");
    const first = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify([...first, { name: "two", url: "https://two.example" }]));
    await runMarketplaceCommand(["add", "three", "https://three.example"], {});
    expect(getMarketplaceSources().map((source) => source.name)).toEqual(["one", "two", "three"]);
    await runMarketplaceCommand(["remove", "two"], {});
    expect(JSON.parse(fs.readFileSync(file, "utf8")).map((source: { name: string }) => source.name)).toEqual(["one", "three"]);
    const listing = await runMarketplaceCommand(["list"], {});
    expect(listing.output).toContain("does not fetch or search catalogues");
    expect(listing.output).not.toContain("/plugin search");
  });

  it.each(["{broken", "{}", '[{"name":"one"}]', '[{"name":"one","url":"x"},{"name":"ONE","url":"y"}]'])(
    "reports invalid storage without overwriting it: %s", async (raw) => {
      fs.writeFileSync(file, raw);
      const result = await runMarketplaceCommand(["add", "one", "https://one.example"], {});
      expect(result.output).toContain("operation failed");
      expect(result.output).not.toContain("successfully");
      expect(fs.readFileSync(file, "utf8")).toBe(raw);
      const options = await sourcePicker({}).load();
      expect(options).toEqual([expect.objectContaining({ label: "Could not load extension sources", disabled: true })]);
    },
  );

  it("keeps the old file and reports failure if replacement fails", async () => {
    await runMarketplaceCommand(["add", "one", "https://one.example"], {});
    const before = fs.readFileSync(file, "utf8");
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error("storage is full"), { code: "ENOSPC" });
    });
    const result = await runMarketplaceCommand(["remove", "one"], {});
    expect(result.output).toContain("operation failed");
    expect(result.output).not.toContain("removed");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect(getMarketplaceSources()).toHaveLength(1);
    expect(fs.readdirSync(directory)).toEqual(["sources.json"]);
  });

  it("keeps duplicate registration a no-op and isolates path overrides", async () => {
    await runMarketplaceCommand(["add", "One", "https://one.example"], {});
    const before = fs.readFileSync(file, "utf8");
    expect((await runMarketplaceCommand(["add", "one", "https://other.example"], {})).output).toContain("already exists");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    process.env.CHEERS_MARKETPLACES_FILE = path.join(directory, "other.json");
    expect(getMarketplaceSources()).toEqual([]);
  });
});
