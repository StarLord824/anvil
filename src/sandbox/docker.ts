import type { ExecResult } from "../workspace/backend";

export interface SandboxOpts {
  image: string;
  container: string;
  hostDir: string;
}

async function docker(args: string[], timeoutMs?: number): Promise<ExecResult> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const proc = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    signal: controller.signal,
  });
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode, timedOut: false };
  } catch {
    return { stdout: "", stderr: "timed out", exitCode: 124, timedOut: true };
  } finally {
    clearTimeout(timer);
  }
}

function toDockerPath(hostPath: string): string {
  const posix = hostPath.replace(/\\/g, "/");
  const drive = /^([A-Za-z]):\/(.*)$/.exec(posix);
  if (!drive) return posix;
  return `/${drive[1].toLowerCase()}/${drive[2]}`;
}

export class DockerSandbox {
  constructor(private readonly opts: SandboxOpts) {}

  async ensure(): Promise<void> {
    const running = await docker(["ps", "-q", "-f", `name=^${this.opts.container}$`]);
    if (running.stdout.trim() !== "") return;
    const stale = await docker(["ps", "-aq", "-f", `name=^${this.opts.container}$`]);
    if (stale.stdout.trim() !== "") {
      await docker(["rm", "-f", this.opts.container]);
    }
    const created = await docker([
      "run",
      "-d",
      "--name",
      this.opts.container,
      "-v",
      `${toDockerPath(this.opts.hostDir)}:/work`,
      "-w",
      "/work",
      this.opts.image,
      "sleep",
      "infinity",
    ]);
    if (created.exitCode !== 0) throw new Error(`sandbox start failed: ${created.stderr.trim()}`);
  }

  async run(command: string, timeoutMs: number): Promise<ExecResult> {
    await this.ensure();
    return docker(["exec", "-w", "/work", this.opts.container, "sh", "-lc", command], timeoutMs);
  }

  async destroy(): Promise<void> {
    await docker(["rm", "-f", this.opts.container]);
  }
}
