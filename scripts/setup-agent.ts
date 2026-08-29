export {};
/**
 * Setup helper: registers the Anvil MCP connector and an agent that requires
 * human approval for the egress tool.
 *
 * On Windows, TrueForge 0.1.4 standalone currently fails to start due to a
 * file:// URL handling bug (see our Task 6 verification). In that case this
 * script prints manual UI steps instead of failing silently.
 *
 * Intended Linux / Docker path:
 *   bun run scripts/setup-agent.ts
 *
 * Env required (via .env or shell):
 *   ANVIL_PORT, ANVIL_TOKEN, WORKSPACE_DIR, GITHUB_TOKEN, GITHUB_REPO
 *   TF_BASE (optional, defaults to http://127.0.0.1:8790)
 */

const TF_BASE = process.env.TF_BASE ?? "http://127.0.0.1:8790";
const ANVIL_URL = `http://127.0.0.1:${process.env.ANVIL_PORT ?? 8791}/mcp`;
const ANVIL_TOKEN = process.env.ANVIL_TOKEN ?? "";

async function tryFetchOpenApi(): Promise<void> {
  try {
    const response = await fetch(`${TF_BASE}/openapi.json`);
    if (!response.ok) {
      console.log(`Harness not reachable at ${TF_BASE} (HTTP ${response.status}).`);
      printManual();
      return;
    }
    const swagger = (await response.json()) as { paths?: Record<string, unknown> };
    const paths = Object.keys(swagger.paths ?? {});
    console.log("Discovered harness OpenAPI paths:");
    for (const path of paths.sort()) console.log(`  ${path}`);
    const hasApproval = JSON.stringify(swagger).includes("require_approval_for_tools");
    console.log(`\nrequire_approval_for_tools present: ${hasApproval}`);
    if (!hasApproval) {
      console.log("Approval key not found in spec — check harness version.");
    }
    printApiSteps(paths);
  } catch (error) {
    console.log(`Could not reach harness at ${TF_BASE}: ${error instanceof Error ? error.message : String(error)}`);
    printManual();
  }
}

function printApiSteps(paths: string[]): void {
  console.log("\nIf the spec contains connector/agent create endpoints, POST as below.");
  console.log("Otherwise configure the connector and agent through the harness UI.");

  console.log("\n--- Connector (adapt path to your spec) ---");
  console.log(`POST ${TF_BASE}/api/connectors (or /api/mcp/servers)`);
  console.log(
    JSON.stringify(
      {
        name: "anvil",
        url: ANVIL_URL,
        auth: { type: "header", header: "x-anvil-token", value: ANVIL_TOKEN },
      },
      null,
      2,
    ),
  );

  console.log("\n--- Agent ---");
  console.log(`POST ${TF_BASE}/api/agents`);
  console.log(
    JSON.stringify(
      {
        name: "anvil",
        connectors: ["anvil"],
        require_approval_for_tools: ["open_pr"],
        enable_tools: ["read", "grep", "edit", "exec", "snapshot", "open_pr"],
      },
      null,
      2,
    ),
  );
  console.log("\nVerify: prompt `open a pull request titled \"probe\" on branch probe/1` should pause for approval.");
}

function printManual(): void {
  console.log(`
Manual steps when API discovery fails (e.g. Windows standalone bug):

1. Start the harness the Linux way (recommended for judges):
     git clone https://github.com/truefoundry/trueforge.git
     cd trueforge && docker compose up

   Or on Linux/macOS:  npx @truefoundry/trueforge

2. In the harness UI, add an MCP connector:
     URL:   ${ANVIL_URL}
     Header: x-anvil-token = ${ANVIL_TOKEN || "<your token>"}

3. Create an agent that uses connector "anvil" and set
     require_approval_for_tools = ["open_pr"]

4. Prompt:  open a pull request titled "probe" on branch probe/1 with body "probe"
   Expected: harness pauses with an approval card naming open_pr.
   Deny should leave no PR; Allow should create it (and log the effect in .anvil/ledger.jsonl).

Current harness issue on Windows: standalone fails with
  "Only URLs with a scheme in: file, data, and node are supported"
  + "LocalSandboxProvider supports macOS and Linux only (got win32)".
  This is a harness bug, not Anvil. Docker compose path works via the Linux engine.
`);
}

await tryFetchOpenApi();
