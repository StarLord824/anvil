import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Ledger } from "../ledger/ledger";
import type { DockerSandbox } from "../sandbox/docker";
import type { WorkspaceBackend } from "../workspace/backend";
import { editTool } from "./edit";
import { execTool } from "./exec";
import { grepTool } from "./grep";
import { readTool } from "./read";

export interface ToolDeps {
  ws: WorkspaceBackend;
  ledger: Ledger;
  sandbox: DockerSandbox;
  onEvent: (name: string, payload: unknown) => void;
}

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

async function snapshotBefore(deps: ToolDeps, label: string): Promise<string | undefined> {
  const [info] = await deps.ws.snapshot("take", undefined, label);
  return info?.id;
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "read",
    {
      description: "Read a file from the workspace as numbered lines.",
      inputSchema: { path: z.string(), offset: z.number().optional(), limit: z.number().optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      await deps.ledger.recordCall("read", digest(args));
      const result = await readTool(deps.ws, args);
      deps.onEvent("call", { tool: "read", path: args.path });
      return { content: [{ type: "text", text: result.text }] };
    },
  );

  server.registerTool(
    "grep",
    {
      description: "Regex search across workspace files.",
      inputSchema: { pattern: z.string(), path: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      await deps.ledger.recordCall("grep", digest(args));
      const result = await grepTool(deps.ws, args);
      deps.onEvent("call", { tool: "grep", pattern: args.pattern });
      return { content: [{ type: "text", text: result.text }] };
    },
  );

  server.registerTool(
    "edit",
    {
      description:
        "Replace a unique exact string in a workspace file. A snapshot is taken automatically first, so this is reversible.",
      inputSchema: { path: z.string(), old_text: z.string(), new_text: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      const snapshotId = await snapshotBefore(deps, `edit ${args.path}`);
      await deps.ledger.recordCall("edit", digest(args), snapshotId);
      const result = await editTool(deps.ws, args);
      deps.onEvent("call", { tool: "edit", path: args.path, snapshotId });
      return { content: [{ type: "text", text: `${result.text} (snapshot ${snapshotId})` }] };
    },
  );

  server.registerTool(
    "exec",
    {
      description:
        "Run a shell command inside the workspace sandbox container. A snapshot is taken automatically first.",
      inputSchema: { command: z.string(), timeout_s: z.number().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      const snapshotId = await snapshotBefore(deps, `exec ${args.command.slice(0, 40)}`);
      await deps.ledger.recordCall("exec", digest(args), snapshotId);
      const result = await execTool(deps.sandbox, args);
      deps.onEvent("call", { tool: "exec", command: args.command, snapshotId });
      return { content: [{ type: "text", text: result.text }] };
    },
  );

  server.registerTool(
    "snapshot",
    {
      description: "Take, list, or restore a workspace snapshot.",
      inputSchema: {
        action: z.enum(["take", "list", "restore"]),
        id: z.string().optional(),
        label: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      const infos = await deps.ws.snapshot(args.action, args.id, args.label ?? "manual");
      if (args.action === "restore" && args.id) {
        const surviving = await deps.ledger.recordRestore(args.id);
        deps.onEvent("restore", { snapshotId: args.id, surviving });
      }
      return {
        content: [
          {
            type: "text",
            text: infos.map((info) => `${info.id} ${info.ts} ${info.label}`).join("\n") || "none",
          },
        ],
      };
    },
  );
}
