import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadConfig } from "./config";
import { Ledger } from "./ledger/ledger";
import { registerTools } from "./tools/registry";
import { LocalWorkspace } from "./workspace/local";

// Lightweight .env loader — no dependency
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath) && !process.env.ANVIL_TOKEN) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const config = loadConfig();
const ws = new LocalWorkspace(config.workspaceDir);
const ledger = new Ledger(join(config.workspaceDir, ".anvil", "ledger.jsonl"));
const listeners = new Set<(event: string) => void>();
const onEvent = (name: string, payload: unknown) => {
  const frame = `data: ${JSON.stringify({ name, payload, ts: new Date().toISOString() })}\n\n`;
  for (const listener of listeners) listener(frame);
};

const app = express();
app.use(express.json({ limit: "8mb" }));

app.use("/mcp", (req, res, next) => {
  if (req.header("x-anvil-token") !== config.token) {
    res.status(401).json({ error: "bad token" });
    return;
  }
  next();
});

app.post("/mcp", async (req, res) => {
  const server = new McpServer({ name: "anvil", version: "0.1.0" });
  registerTools(server, { ws, ledger, onEvent });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`anvil listening on http://127.0.0.1:${config.port}/mcp`);
});

export { app, ledger, listeners, onEvent, ws };
