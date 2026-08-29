export interface Dirent {
  name: string;
  path: string;
  isDir: boolean;
}

export interface Stat {
  path: string;
  size: number;
  isDir: boolean;
}

export interface ExecOpts {
  timeoutMs: number;
  cwd?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface SnapshotInfo {
  id: string;
  commit: string;
  label: string;
  ts: string;
}

export interface WorkspaceBackend {
  list(path: string): Promise<Dirent[]>;
  stat(path: string): Promise<Stat | null>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  exec(argv: string[], opts: ExecOpts): Promise<ExecResult>;
  snapshot(op: "take" | "restore" | "list", id?: string, label?: string): Promise<SnapshotInfo[]>;
}
