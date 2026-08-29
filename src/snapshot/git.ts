import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SnapshotInfo } from "../workspace/backend";

async function git(dir: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  return stdout.trim();
}

export class GitSnapshotStore {
  private readonly metaPath: string;

  constructor(private readonly repoDir: string) {
    this.metaPath = join(repoDir, ".anvil", "snapshots.jsonl");
  }

  async take(label: string): Promise<SnapshotInfo> {
    await mkdir(join(this.repoDir, ".anvil"), { recursive: true });
    await git(this.repoDir, ["add", "-A"]);
    const tree = await git(this.repoDir, ["write-tree"]);
    const parent = await git(this.repoDir, ["rev-parse", "HEAD"]).catch(() => "");
    const commitArgs = parent
      ? ["commit-tree", tree, "-p", parent, "-m", `anvil: ${label}`]
      : ["commit-tree", tree, "-m", `anvil: ${label}`];
    const commit = await git(this.repoDir, commitArgs);
    const id = `snap-${Date.now().toString(36)}-${commit.slice(0, 7)}`;
    await git(this.repoDir, ["update-ref", `refs/anvil/snapshots/${id}`, commit]);
    const info: SnapshotInfo = { id, commit, label, ts: new Date().toISOString() };
    await appendFile(this.metaPath, `${JSON.stringify(info)}\n`, "utf8");
    return info;
  }

  async restore(id: string): Promise<SnapshotInfo> {
    const all = await this.list();
    const info = all.find((s) => s.id === id);
    if (!info) throw new Error(`unknown snapshot: ${id}`);
    await git(this.repoDir, ["read-tree", "-u", "--reset", `${info.commit}^{tree}`]);
    await git(this.repoDir, ["clean", "-fd", "-e", ".anvil"]);
    return info;
  }

  async list(): Promise<SnapshotInfo[]> {
    const raw = await readFile(this.metaPath, "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as SnapshotInfo);
  }
}
