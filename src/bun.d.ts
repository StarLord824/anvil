declare const Bun: {
  spawn(command: string[], opts: { stdout?: unknown; stderr?: unknown; signal?: AbortSignal }): {
    stdout: ReadableStream | null;
    stderr: ReadableStream | null;
    exited: Promise<number>;
  };
  file(path: string): { exists(): Promise<boolean> };
  write(path: string, data: string | Uint8Array): Promise<number>;
};
