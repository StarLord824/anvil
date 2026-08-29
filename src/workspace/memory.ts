import type { Dirent, ExecOpts, ExecResult, SnapshotInfo, Stat, WorkspaceBackend } from "./backend";

export class InMemoryWorkspace implements WorkspaceBackend {
  private files = new Map<string, Uint8Array>();
  private snaps = new Map<string, Map<string, Uint8Array>>();
  private meta: SnapshotInfo[] = [];
  private counter = 0;

  private normalise(p: string): string {
    return p.replace(/\\/g, "/");
  }

  async list(path: string): Promise<Dirent[]> {
    const prefix = path === "" || path === "." ? "" : `${this.normalise(path)}/`;
    const seen = new Map<string, boolean>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) seen.set(rest, false);
      else seen.set(rest.slice(0, slash), true);
    }
    return [...seen].map(([name, isDir]) => ({ name, path: `${prefix}${name}`, isDir }));
  }

  async stat(path: string): Promise<Stat | null> {
    const key = this.normalise(path);
    const bytes = this.files.get(key);
    if (bytes) return { path: key, size: bytes.byteLength, isDir: false };
    for (const existing of this.files.keys()) {
      if (existing.startsWith(`${key}/`)) return { path: key, size: 0, isDir: true };
    }
    return null;
  }

  async read(path: string): Promise<Uint8Array> {
    const bytes = this.files.get(this.normalise(path));
    if (!bytes) throw new Error(`ENOENT: ${path}`);
    return bytes;
  }

  async write(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(this.normalise(path), bytes);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(this.normalise(path));
  }

  async exec(argv: string[], _opts: ExecOpts): Promise<ExecResult> {
    return { stdout: `stub:${argv.join(" ")}`, stderr: "", exitCode: 0, timedOut: false };
  }

  async snapshot(op: "take" | "restore" | "list", id?: string, label = ""): Promise<SnapshotInfo[]> {
    if (op === "list") return [...this.meta];
    if (op === "take") {
      const snapId = `snap-${++this.counter}`;
      this.snaps.set(snapId, new Map(this.files));
      const info: SnapshotInfo = {
        id: snapId,
        commit: snapId,
        label,
        ts: new Date().toISOString(),
      };
      this.meta.push(info);
      return [info];
    }
    if (!id) throw new Error("restore requires an id");
    const saved = this.snaps.get(id);
    if (!saved) throw new Error(`unknown snapshot: ${id}`);
    this.files = new Map(saved);
    return this.meta.filter((m) => m.id === id);
  }
}
