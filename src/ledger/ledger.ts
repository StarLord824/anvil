import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type EffectStatus = "pending" | "committed" | "failed";

export interface CallRecord {
  kind: "call";
  tool: string;
  argsDigest: string;
  snapshotId?: string;
  ts: string;
}

export interface EffectRecord {
  kind: "effect";
  effect: string;
  key: string;
  status: EffectStatus;
  ref?: string;
  reason?: string;
  ts: string;
}

export interface RestoreRecord {
  kind: "restore";
  snapshotId: string;
  committedEffectKeys: string[];
  ts: string;
}

export type LedgerRecord = CallRecord | EffectRecord | RestoreRecord;

export function effectKey(kind: string, parts: string[]): string {
  return createHash("sha256").update([kind, ...parts].join("|")).digest("hex").slice(0, 32);
}

export class EffectAlreadyCommitted extends Error {
  constructor(readonly record: EffectRecord) {
    super(
      `Refused: the irreversible action "${record.effect}" already completed at ${record.ts}` +
        `${record.ref ? ` (${record.ref})` : ""}. Restoring the workspace does not undo it, ` +
        `so it will not be performed again.`,
    );
    this.name = "EffectAlreadyCommitted";
  }
}

export class Ledger {
  constructor(private readonly path: string) {}

  async append(record: LedgerRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(record)}\n`, "utf8");
  }

  async all(): Promise<LedgerRecord[]> {
    const raw = await readFile(this.path, "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as LedgerRecord);
  }

  async recordCall(tool: string, argsDigest: string, snapshotId?: string): Promise<void> {
    await this.append({ kind: "call", tool, argsDigest, snapshotId, ts: new Date().toISOString() });
  }

  async beginEffect(effect: string, key: string): Promise<void> {
    await this.append({ kind: "effect", effect, key, status: "pending", ts: new Date().toISOString() });
  }

  async commitEffect(key: string, ref: string): Promise<void> {
    const effect = await this.latestEffect(key);
    await this.append({
      kind: "effect",
      effect: effect?.effect ?? "unknown",
      key,
      status: "committed",
      ref,
      ts: new Date().toISOString(),
    });
  }

  async failEffect(key: string, reason: string): Promise<void> {
    const effect = await this.latestEffect(key);
    await this.append({
      kind: "effect",
      effect: effect?.effect ?? "unknown",
      key,
      status: "failed",
      reason,
      ts: new Date().toISOString(),
    });
  }

  async recordRestore(snapshotId: string): Promise<string[]> {
    const committed = await this.committedEffects();
    const keys = committed.map((record) => record.key);
    await this.append({
      kind: "restore",
      snapshotId,
      committedEffectKeys: keys,
      ts: new Date().toISOString(),
    });
    return keys;
  }

  async assertEffectAllowed(key: string): Promise<void> {
    const latest = await this.latestEffect(key);
    if (latest?.status === "committed") throw new EffectAlreadyCommitted(latest);
  }

  private async latestEffect(key: string): Promise<EffectRecord | undefined> {
    const effects = (await this.all()).filter(
      (record): record is EffectRecord => record.kind === "effect" && record.key === key,
    );
    return effects.at(-1);
  }

  private async committedEffects(): Promise<EffectRecord[]> {
    const byKey = new Map<string, EffectRecord>();
    for (const record of await this.all()) {
      if (record.kind === "effect") byKey.set(record.key, record);
    }
    return [...byKey.values()].filter((record) => record.status === "committed");
  }
}
