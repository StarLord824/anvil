import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { GitSnapshotStore } from "../snapshot/git";
import type { Dirent, ExecOpts, ExecResult, SnapshotInfo, Stat, WorkspaceBackend } from "./backend";

export class LocalWorkspace implements WorkspaceBackend {
  private readonly snapshots: GitSnapshotStore;

  constructor(private readonly root: string) {
    this.snapshots = new GitSnapshotStore(root);
  }

  private resolve(path: string): string {
    const posix = path.replace(/\\/g, "/");
    const abs = join(this.root, posix);
    const rel = relative(this.root, abs);
    if (rel.startsWith("..")) throw new Error(`path escapes workspace: ${path}`);
    return abs;
  }

  async list(path: string): Promise<Dirent[]> {
    const entries = await readdir(this.resolve(path), { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.replace(/\\/g, "/") === "" ? entry.name : `${path.replace(/\\/g, "/")}/${entry.name}`,
      isDir: entry.isDirectory(),
    }));
  }

  async stat(path: string): Promise<Stat | null> {
    try {
      const info = await stat(this.resolve(path));
      return { path: path.replace(/\\/g, "/"), size: info.size, isDir: info.isDirectory() };
    } catch {
      return null;
    }
  }

  async read(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(path)));
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    const abs = this.resolve(path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolve(path), { recursive: true, force: true });
  }

  async exec(_argv: string[], _opts: ExecOpts): Promise<ExecResult> {
    throw new Error("exec is implemented by DockerSandbox in Task 5");
  }

  async snapshot(op: "take" | "restore" | "list", id?: string, label = ""): Promise<SnapshotInfo[]> {
    if (op === "list") return this.snapshots.list();
    if (op === "take") return [await this.snapshots.take(label)];
    if (!id) throw new Error("restore requires an id");
    return [await this.snapshots.restore(id)];
  }
}
