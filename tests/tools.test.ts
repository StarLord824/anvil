import { expect, test } from "bun:test";
import { InMemoryWorkspace } from "../src/workspace/memory";
import { editTool } from "../src/tools/edit";
import { grepTool } from "../src/tools/grep";
import { readTool } from "../src/tools/read";

const encode = (text: string) => new TextEncoder().encode(text);

test("read returns numbered lines", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("a.ts", encode("one\ntwo\nthree"));
  const result = await readTool(ws, { path: "a.ts" });
  expect(result.text).toBe("1: one\n2: two\n3: three");
});

test("read honours offset and limit", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("a.ts", encode("one\ntwo\nthree\nfour"));
  const result = await readTool(ws, { path: "a.ts", offset: 2, limit: 2 });
  expect(result.text).toBe("2: two\n3: three");
});

test("grep reports path and line number", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("src/a.ts", encode("const x = 1;\nconst y = 2;"));
  const result = await grepTool(ws, { pattern: "const y" });
  expect(result.text).toBe("src/a.ts:2: const y = 2;");
});

test("grep reports no matches distinctly", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("src/a.ts", encode("nothing here"));
  const result = await grepTool(ws, { pattern: "absent" });
  expect(result.text).toBe("no matches");
});

test("edit replaces a unique occurrence", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("a.ts", encode("const x = 1;"));
  await editTool(ws, { path: "a.ts", old_text: "1", new_text: "2" });
  expect(new TextDecoder().decode(await ws.read("a.ts"))).toBe("const x = 2;");
});

test("edit refuses an ambiguous match without writing", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("a.ts", encode("x = 1; y = 1;"));
  await expect(editTool(ws, { path: "a.ts", old_text: "1", new_text: "2" })).rejects.toThrow(
    "appears 2 times",
  );
  expect(new TextDecoder().decode(await ws.read("a.ts"))).toBe("x = 1; y = 1;");
});

test("edit refuses a missing match", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("a.ts", encode("const x = 1;"));
  await expect(editTool(ws, { path: "a.ts", old_text: "zzz", new_text: "2" })).rejects.toThrow(
    "not found",
  );
});
