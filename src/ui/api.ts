import type { Ledger } from "../ledger/ledger";
import type { WorkspaceBackend } from "../workspace/backend";

export interface ApiDeps {
  ledger: Ledger;
  ws: WorkspaceBackend;
  listeners: Set<(frame: string) => void>;
}

export interface Api {
  request(input: string, init?: RequestInit): Promise<Response>;
}

export function buildApi(deps: ApiDeps): Api {
  return {
    async request(input: string, init?: RequestInit): Promise<Response> {
      const url = new URL(input, "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/ledger" && method === "GET") {
        return Response.json({ records: await deps.ledger.all() });
      }

      if (url.pathname === "/api/snapshots" && method === "GET") {
        return Response.json({ snapshots: await deps.ws.snapshot("list") });
      }

      if (url.pathname === "/api/rollback" && method === "POST") {
        const { id } = (await new Response(init?.body).json()) as { id: string };
        await deps.ws.snapshot("restore", id);
        const surviving = await deps.ledger.recordRestore(id);
        return Response.json({ ok: true, id, survivingEffects: surviving });
      }

      return new Response("not found", { status: 404 });
    },
  };
}
