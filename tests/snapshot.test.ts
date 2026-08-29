import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitSnapshotStore } from "../src/snapshot/git";

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "anvil-snap-"));
  const run = async (...args: string[]) => {
    const proc = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
  };
  await run("init", "-b", "main");
  await run("config", "user.email", "anvil@example.com");
  await run("config", "user.name", "Anvil");
  await writeFile(join(dir, "a.txt"), "v1");
  await run("add", "-A");
  await run("commit", "-m", "init");
  return dir;
}

test("restore reverts a modified tracked file", async () => {
  const dir = await fixture();
  const store = new GitSnapshotStore(dir);
  const snap = await store.take("before edit");
  await writeFile(join(dir, "a.txt"), "v2");
  await store.restore(snap.id);
  expect(await readFile(join(dir, "a.txt"), "utf8")).toBe("v1");
});

test("restore removes a file created after the snapshot", async () => {
  const dir = await fixture();
  const store = new GitSnapshotStore(dir);
  const snap = await store.take("before new file");
  await writeFile(join(dir, "b.txt"), "new");
  await store.restore(snap.id);
  expect(await Bun.file(join(dir, "b.txt")).exists()).toBe(false);
});

test("list returns snapshots newest last", async () => {
  const dir = await fixture();
  const store = new GitSnapshotStore(dir);
  await store.take("one");
  await store.take("two");
  const all = await store.list();
  expect(all.map((s) => s.label)).toEqual(["one", "two"]);
});
