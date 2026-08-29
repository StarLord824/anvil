import type { WorkspaceBackend } from "../workspace/backend";

const SKIP = new Set([".git", "node_modules", ".anvil"]);
const MAX_MATCHES = 200;

export interface GrepArgs {
  pattern: string;
  path?: string;
}

async function walk(ws: WorkspaceBackend, dir: string, out: string[]): Promise<void> {
  for (const entry of await ws.list(dir)) {
    if (SKIP.has(entry.name)) continue;
    if (entry.isDir) await walk(ws, entry.path, out);
    else out.push(entry.path);
  }
}

export async function grepTool(ws: WorkspaceBackend, args: GrepArgs): Promise<{ text: string }> {
  const regex = new RegExp(args.pattern);
  const files: string[] = [];
  await walk(ws, args.path ?? "", files);
  const matches: string[] = [];
  for (const file of files) {
    const content = new TextDecoder().decode(await ws.read(file));
    content.split("\n").forEach((line, index) => {
      if (matches.length < MAX_MATCHES && regex.test(line)) {
        matches.push(`${file}:${index + 1}: ${line}`);
      }
    });
  }
  return { text: matches.length === 0 ? "no matches" : matches.join("\n") };
}
