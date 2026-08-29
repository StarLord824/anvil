import type { WorkspaceBackend } from "../workspace/backend";

export interface ReadArgs {
  path: string;
  offset?: number;
  limit?: number;
}

export async function readTool(ws: WorkspaceBackend, args: ReadArgs): Promise<{ text: string }> {
  const content = new TextDecoder().decode(await ws.read(args.path));
  const lines = content.split("\n");
  const start = Math.max(1, args.offset ?? 1);
  const end = args.limit ? start + args.limit - 1 : lines.length;
  const slice = lines
    .slice(start - 1, end)
    .map((line, index) => `${start + index}: ${line}`)
    .join("\n");
  return { text: slice };
}
