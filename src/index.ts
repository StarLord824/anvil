import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { RestGitHubClient } from "./github";
import { Ledger } from "./ledger/ledger";
import { registerTools } from "./tools/registry";
import { DockerSandbox } from "./sandbox/docker";
import { buildApi } from "./ui/api";
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
const sandbox = new DockerSandbox({
  image: config.sandboxImage,
  container: config.sandboxContainer,
  hostDir: config.sandboxHostDir,
});
const openPr = {
  ledger,
  repo: config.githubRepo,
  pushBranch: async (branch: string) => {
    const result = await sandbox.run(
      `git checkout -B ${branch} && git add -A && git -c user.email=anvil@local -c user.name=Anvil commit -m "anvil: ${branch}" && git push -u origin ${branch}`,
      120_000,
    );
    if (result.exitCode !== 0) throw new Error(`push failed: ${result.stderr.trim()}`);
  },
  github: new RestGitHubClient(config.githubToken),
};
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
  registerTools(server, { ws, ledger, sandbox, openPr, onEvent });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const api = buildApi({ ledger, ws, listeners });

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const listener = (frame: string) => res.write(frame);
  listeners.add(listener);
  req.on("close", () => listeners.delete(listener));
});

for (const route of ["/api/ledger", "/api/snapshots"] as const) {
  app.get(route, async (_req, res) => {
    const response = await api.request(route);
    res.status(response.status).json(await response.json());
  });
}

app.post("/api/rollback", async (req, res) => {
  const response = await api.request("/api/rollback", {
    method: "POST",
    body: JSON.stringify(req.body),
    headers: { "content-type": "application/json" },
  });
  const payload = await response.json();
  onEvent("restore", payload);
  res.status(response.status).json(payload);
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.sendFile(fileURLToPath(new URL("./ui/timeline.html", import.meta.url)));
});

app.listen(config.port, () => {
  console.log(`anvil listening on http://127.0.0.1:${config.port}/mcp`);
});

export { api, app, ledger, listeners, onEvent, openPr, sandbox, ws };
