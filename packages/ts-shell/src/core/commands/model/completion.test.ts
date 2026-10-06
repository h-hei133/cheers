import { expect, it } from "vitest";
import { modelArgumentCompletions } from "./completion.js";
import { parseModelArgs } from "./syntax.js";

const values = (prefix: string) => modelArgumentCompletions(prefix)?.map(item => item.value) ?? [];
it("projects actions and aliases from the executable syntax", () => {
  expect(values("")).toEqual(expect.arrayContaining(["status", "refresh", "config", "list", "use", "help"]));
  expect(values("se")).toContain("set");
  expect(values("ls")).toContain("ls");
  expect(parseModelArgs(["--help"]).ok).toBe(true);
});
it.each(["status ", "help ", "config ", "refresh ", "use first extra ", "use --unknown "])("does not offer models after %s", prefix => {
  expect(values(prefix)).toEqual([]);
});
it("keeps flags synchronous and delegates entities to the surface", () => {
  expect(values("use openai/")).toEqual([]);
  expect(values("list open")).toEqual([]);
  expect(values("use chosen --g")).toEqual(["--global"]);
  expect(values("chosen --g")).toEqual(["--global"]);
  expect(values("use chosen --global ")).toEqual(["--effort"]);
  expect(values("use chosen --global --effort ")).toEqual(["low", "medium", "high", "auto", "off", "none"]);
  expect(values("use chosen --global --effort low ")).toEqual([]);
});
