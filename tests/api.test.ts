import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../src/ledger/ledger";
import { InMemoryWorkspace } from "../src/workspace/memory";
import { buildApi } from "../src/ui/api";

async function api() {
  const dir = await mkdtemp(join(tmpdir(), "anvil-api-"));
  const ledger = new Ledger(join(dir, "ledger.jsonl"));
  const ws = new InMemoryWorkspace();
  return { app: buildApi({ ledger, ws, listeners: new Set() }), ledger, ws };
}

test("GET /api/ledger returns appended records", async () => {
  const { app, ledger } = await api();
  await ledger.recordCall("edit", "abc", "snap-1");
  const response = await app.request("/api/ledger");
  const body = (await response.json()) as { records: { tool?: string }[] };
  expect(body.records[0].tool).toBe("edit");
});

test("POST /api/rollback restores and records the restore", async () => {
  const { app, ws, ledger } = await api();
  await ws.write("a.txt", new TextEncoder().encode("v1"));
  const [snap] = await ws.snapshot("take", undefined, "before");
  await ws.write("a.txt", new TextEncoder().encode("v2"));
  const response = await app.request("/api/rollback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: snap.id }),
  });
  expect(response.status).toBe(200);
  expect(new TextDecoder().decode(await ws.read("a.txt"))).toBe("v1");
  const kinds = (await ledger.all()).map((record) => record.kind);
  expect(kinds).toContain("restore");
});
