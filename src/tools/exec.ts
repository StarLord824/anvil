import type { DockerSandbox } from "../sandbox/docker";

export interface ExecArgs {
  command: string;
  timeout_s?: number;
}

export async function execTool(
  sandbox: DockerSandbox,
  args: ExecArgs,
): Promise<{ text: string }> {
  const result = await sandbox.run(args.command, (args.timeout_s ?? 120) * 1000);
  const parts = [`exit ${result.exitCode}${result.timedOut ? " (timed out)" : ""}`];
  if (result.stdout.trim()) parts.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`);
  return { text: parts.join("\n\n") };
}
