import type { WorkspaceBackend } from "../workspace/backend";

export interface EditArgs {
  path: string;
  old_text: string;
  new_text: string;
}

export async function editTool(ws: WorkspaceBackend, args: EditArgs): Promise<{ text: string }> {
  const content = new TextDecoder().decode(await ws.read(args.path));
  const occurrences = content.split(args.old_text).length - 1;
  if (occurrences === 0) throw new Error(`old_text not found in ${args.path}`);
  if (occurrences > 1) {
    throw new Error(
      `old_text appears ${occurrences} times in ${args.path}; include more surrounding context`,
    );
  }
  await ws.write(args.path, new TextEncoder().encode(content.replace(args.old_text, args.new_text)));
  return { text: `edited ${args.path}` };
}
