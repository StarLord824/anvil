export interface Config {
  port: number;
  token: string;
  workspaceDir: string;
  sandboxImage: string;
  sandboxContainer: string;
  sandboxHostDir: string;
  githubToken: string;
  githubRepo: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env: ${name}`);
  return value;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.ANVIL_PORT ?? 8791),
    token: required("ANVIL_TOKEN"),
    workspaceDir: required("WORKSPACE_DIR"),
    sandboxImage: process.env.SANDBOX_IMAGE ?? "node:24-bookworm-slim",
    sandboxContainer: process.env.SANDBOX_CONTAINER ?? "anvil-sbx-demo",
    sandboxHostDir: process.env.SANDBOX_HOST_DIR ?? required("WORKSPACE_DIR"),
    githubToken: process.env.GITHUB_TOKEN ?? "",
    githubRepo: process.env.GITHUB_REPO ?? "",
  };
}
