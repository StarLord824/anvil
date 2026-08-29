import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EffectAlreadyCommitted, Ledger, effectKey } from "../src/ledger/ledger";

async function ledger(): Promise<Ledger> {
  const dir = await mkdtemp(join(tmpdir(), "anvil-ledger-"));
  return new Ledger(join(dir, "ledger.jsonl"));
}

test("effectKey is stable and order-sensitive", () => {
  expect(effectKey("open_pr", ["repo", "branch"])).toBe(effectKey("open_pr", ["repo", "branch"]));
  expect(effectKey("open_pr", ["repo", "branch"])).not.toBe(effectKey("open_pr", ["branch", "repo"]));
});

test("append then all round-trips records in order", async () => {
  const log = await ledger();
  await log.recordCall("edit", "abc", "snap-1");
  await log.recordCall("exec", "def");
  const kinds = (await log.all()).map((r) => r.kind);
  expect(kinds).toEqual(["call", "call"]);
});

test("a pending effect does not block a retry", async () => {
  const log = await ledger();
  const key = effectKey("open_pr", ["r", "b"]);
  await log.beginEffect("open_pr", key);
  await log.assertEffectAllowed(key);
});

test("a committed effect blocks a retry with evidence", async () => {
  const log = await ledger();
  const key = effectKey("open_pr", ["r", "b"]);
  await log.beginEffect("open_pr", key);
  await log.commitEffect(key, "https://github.com/x/y/pull/1");
  let caught: unknown;
  try {
    await log.assertEffectAllowed(key);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EffectAlreadyCommitted);
  expect((caught as EffectAlreadyCommitted).record.ref).toBe("https://github.com/x/y/pull/1");
});

test("a failed effect does not block a retry", async () => {
  const log = await ledger();
  const key = effectKey("open_pr", ["r", "b"]);
  await log.beginEffect("open_pr", key);
  await log.failEffect(key, "network");
  await log.assertEffectAllowed(key);
});

test("restore records committed effects and never erases them", async () => {
  const log = await ledger();
  const key = effectKey("open_pr", ["r", "b"]);
  await log.beginEffect("open_pr", key);
  await log.commitEffect(key, "https://github.com/x/y/pull/1");
  const surviving = await log.recordRestore("snap-1");
  expect(surviving).toEqual([key]);
  await expect(log.assertEffectAllowed(key)).rejects.toBeInstanceOf(EffectAlreadyCommitted);
});
