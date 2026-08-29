import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DockerSandbox } from "../src/sandbox/docker";

const hasDocker = await (async () => {
  try {
    const proc = Bun.spawn(["docker", "version"], { stdout: "ignore", stderr: "ignore" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
})();

test.skipIf(!hasDocker)(
  "exec runs a command against the mounted workspace",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-exec-"));
    await Bun.write(join(dir, "hello.txt"), "hi");
    const sandbox = new DockerSandbox({
      image: "alpine",
      container: `anvil-test-${Date.now().toString(36)}`,
      hostDir: dir,
    });
    await sandbox.ensure();
    const result = await sandbox.run("cat hello.txt", 20_000);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hi");
    await sandbox.destroy();
  },
  30_000,
);

test.skipIf(!hasDocker)(
  "exec reports a non-zero exit without throwing",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-exec-"));
    const sandbox = new DockerSandbox({
      image: "alpine",
      container: `anvil-test-${Date.now().toString(36)}`,
      hostDir: dir,
    });
    await sandbox.ensure();
    const result = await sandbox.run("exit 3", 20_000);
    expect(result.exitCode).toBe(3);
    await sandbox.destroy();
  },
  30_000,
);
