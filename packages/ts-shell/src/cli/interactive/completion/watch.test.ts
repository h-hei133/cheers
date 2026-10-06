import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { observeDirectory } from "./watch.js";
let root: string;
const stops: Array<() => void> = [];
beforeEach(() => { root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-directory-watch-")); });
afterEach(() => { stops.splice(0).forEach(stop => stop()); fs.rmSync(root, { recursive: true, force: true }); });
it("observes new entries, replacement and later creation without writing the directory", async () => {
  const directory = path.join(root, "parent", "child");
  const changed = vi.fn(); stops.push(observeDirectory(directory, changed));
  expect(fs.readdirSync(root)).toEqual([]);
  fs.mkdirSync(directory, { recursive: true });
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  changed.mockClear();
  fs.writeFileSync(path.join(directory, "one"), "one");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  changed.mockClear();
  fs.renameSync(directory, path.join(root, "parent", "old"));
  fs.mkdirSync(directory);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  changed.mockClear();
  fs.writeFileSync(path.join(directory, "two"), "two");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  stops[0]!(); changed.mockClear();
  fs.writeFileSync(path.join(directory, "three"), "three");
  await new Promise(resolve => setTimeout(resolve, 100));
  expect(changed).not.toHaveBeenCalled();
});

it("observes a catalog file atomically replaced by a new inode", async () => {
  const file = path.join(root, "models.json"); fs.writeFileSync(file, "first");
  const changed = vi.fn(); stops.push(observeDirectory(file, changed));
  const temporary = path.join(root, "next.json"); fs.writeFileSync(temporary, "second");
  fs.renameSync(temporary, file);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  changed.mockClear(); fs.writeFileSync(file, "third");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
});
