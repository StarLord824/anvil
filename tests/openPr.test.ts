import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EffectAlreadyCommitted, Ledger } from "../src/ledger/ledger";
import { openPrTool } from "../src/tools/openPr";

async function deps() {
  const dir = await mkdtemp(join(tmpdir(), "anvil-pr-"));
  const calls: string[] = [];
  return {
    calls,
    ledger: new Ledger(join(dir, "ledger.jsonl")),
    repo: "StarLord824/anvil-demo-target",
    pushBranch: async (branch: string) => {
      calls.push(`push:${branch}`);
    },
    github: {
      createPullRequest: async (opts: { title: string }) => {
        calls.push(`pr:${opts.title}`);
        return "https://github.com/StarLord824/anvil-demo-target/pull/1";
      },
    },
  };
}

test("open_pr pushes, creates the PR, and commits the effect", async () => {
  const d = await deps();
  const result = await openPrTool(d, { title: "Upgrade router", body: "b", branch: "fix/1" });
  expect(result.text).toContain("pull/1");
  expect(d.calls).toEqual(["push:fix/1", "pr:Upgrade router"]);
});

test("a second identical open_pr is refused with evidence", async () => {
  const d = await deps();
  await openPrTool(d, { title: "Upgrade router", body: "b", branch: "fix/1" });
  let caught: unknown;
  try {
    await openPrTool(d, { title: "Upgrade router", body: "b", branch: "fix/1" });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(EffectAlreadyCommitted);
  expect(d.calls).toEqual(["push:fix/1", "pr:Upgrade router"]);
});

test("a rollback between attempts still refuses the duplicate", async () => {
  const d = await deps();
  await openPrTool(d, { title: "Upgrade router", body: "b", branch: "fix/1" });
  await d.ledger.recordRestore("snap-1");
  await expect(
    openPrTool(d, { title: "Upgrade router", body: "b", branch: "fix/1" }),
  ).rejects.toBeInstanceOf(EffectAlreadyCommitted);
});

test("a failed push leaves the effect retryable", async () => {
  const d = await deps();
  const failing = {
    ...d,
    pushBranch: async () => {
      throw new Error("network down");
    },
  };
  await expect(
    openPrTool(failing, { title: "T", body: "b", branch: "fix/2" }),
  ).rejects.toThrow("network down");
  await openPrTool(d, { title: "T", body: "b", branch: "fix/2" });
  expect(d.calls).toEqual(["push:fix/2", "pr:T"]);
});
