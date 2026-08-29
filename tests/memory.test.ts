import { expect, test } from "bun:test";
import { InMemoryWorkspace } from "../src/workspace/memory";

test("write then read round-trips", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("src/a.ts", new TextEncoder().encode("hello"));
  const bytes = await ws.read("src/a.ts");
  expect(new TextDecoder().decode(bytes)).toBe("hello");
});

test("list returns direct children only", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("src/a.ts", new Uint8Array());
  await ws.write("src/deep/b.ts", new Uint8Array());
  const names = (await ws.list("src")).map((d) => d.name).sort();
  expect(names).toEqual(["a.ts", "deep"]);
});

test("snapshot take then restore reverts a write", async () => {
  const ws = new InMemoryWorkspace();
  await ws.write("a.txt", new TextEncoder().encode("v1"));
  const [snap] = await ws.snapshot("take", undefined, "before");
  await ws.write("a.txt", new TextEncoder().encode("v2"));
  await ws.snapshot("restore", snap.id);
  expect(new TextDecoder().decode(await ws.read("a.txt"))).toBe("v1");
});

test("read of a missing path rejects", async () => {
  const ws = new InMemoryWorkspace();
  await expect(ws.read("nope.txt")).rejects.toThrow("ENOENT");
});
