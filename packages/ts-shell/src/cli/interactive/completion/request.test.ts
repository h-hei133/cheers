import { expect, it } from "vitest";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { parseSyntax } from "../../../core/commands/syntax/parse.js";
import { tokenizeCommandArgs } from "../../../core/commands/arguments.js";
import { memorySyntax } from "../../../memory/commands/syntax.js";

function request(marked: string) {
  const cursor = marked.indexOf("|");
  const text = marked.replace("|", "");
  return catalogRequest({ text, cursor: cursor < 0 ? text.length : cursor, revision: 1 });
}

it.each([
  ["delete", "record"], ["invalidate", "invalidatable"], ["approve", "approvable"],
  ["reject", "candidate"], ["save", "approved"],
])("shares %s entity positions across the memory command and true aliases", (action, kind) => {
  for (const name of ["memory", "mem", "MEMORY", "MEM"]) {
    expect(request(`/${name} ${action} `)?.kind).toBe(kind);
  }
});

it.each([
  ["/mem delete pm|r:old  reason with spaces", "record"],
  ["/memory invalidate pm|r:old\tduplicate record", "invalidatable"],
  ["/mem approve pm|c:old  verified the source", "approvable"],
  ["/memory reject pm|c:old  unsafe content", "candidate"],
  ["/memory delete -- pm|r:old --literal-reason", "record"],
])("uses the complete valid grammar while editing an ID in %s", (draft, kind) => {
  expect(request(draft)?.kind).toBe(kind);
});

it.each([
  "/recall delete |", "/retain approve |", "/mem approve pm|c:old --all-safe",
  "/memory reject pm|c:old --unsafe", "/memory delete pm|r:old --unknown",
  "/memory save pm|c:old extra", "/mem delete pmr:old reason|",
  "/mcp tools ser|ver extra", "/connect use con|nection extra", "/permissions revoke ke|y extra",
  "/workflow run na|me extra",
  "/memory delete completion-target reason|",
  "/memory delete completion-target completion-target_ reason|",
])("does not load an entity catalog for an invalid or non-entity position: %s", draft => {
  expect(request(draft)).toBeUndefined();
});

it("replaces only the quoted ID and leaves alias, tabs, spacing and reason intact", () => {
  const marked = '  /MEM\tdelete "pm|r:old"  理由 👩‍💻\tend  ';
  const req = request(marked)!;
  expect(req).toBeDefined();
  const edit = catalogSuggestions(req, [{ value: "pmr:new", label: "pmr:new" }])[0]!.edit!;
  const result = req.snapshot.text.slice(0, edit.from) + edit.text + req.snapshot.text.slice(edit.to);
  expect(result).toBe('  /MEM\tdelete "pmr:new"  理由 👩‍💻\tend  ');
  expect(parseSyntax(memorySyntax, tokenizeCommandArgs(result).slice(1))).toMatchObject({
    ok: true, action: { name: "delete" }, args: ["pmr:new", "理由", "👩‍💻", "end"],
  });
});

it.each([
  ["/mcp -- tools se|rver", "mcp"],
  ["/connect -- activate co|nnection", "connection"],
  ["/permissions -- remove ke|y", "grant"],
  ["/workflow -- start na|me", "workflow"],
  ["/resume switch -- sess_|old", "session"],
  ["/tree -- entry|", "tree"],
])("recognizes runtime-valid option terminators before actions: %s", (draft, kind) => {
  expect(request(draft)?.kind).toBe(kind);
});
