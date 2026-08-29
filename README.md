# Anvil — reversible workspace, guarded egress

> **Git for agent actions.** The agent can run free because everything it does inside the workspace is reversible by construction, and everything irreversible goes through a human — and can never be silently re-done when you wind the clock back.

Anvil is a TrueForge-native execution layer for coding agents. It demonstrates the event thesis — *license to act* — as a mechanism, not a slogan.

## The problem

Two permission models dominate agents, and both fail:

- **Ask every time.** The human approves 40 tool calls, stops reading, the gate becomes theatre.
- **Ask never.** The agent is fast and the blast radius is the whole machine.

Checkpoint/restore ("undo for agents") is now common (Kiro, Claude Code, Replit). What none of them handle is the **semantic rollback** failure (arXiv 2603.20625): after a restore, the agent replays its plan and re-executes an external side effect — a second PR, a second email — because the workspace forgot but the outside world did not.

## How Anvil works — three mechanisms, one thesis

1. **Reversible workspace.** Every mutating tool (`edit`, `exec`) takes an automatic git-plumbing snapshot (`write-tree`/`commit-tree`/`read-tree -u --reset`) before it acts. Any snapshot can be restored. `.anvil/` is ignored, so the ledger and snapshot index survive restores.

2. **Egress gate.** Only one tool leaves the workspace: `open_pr` (commit, push, open PR). It is annotated `destructiveHint: true, openWorldHint: true` and registered with TrueForge's `require_approval_for_tools: ["open_pr"]`. The harness — not Anvil — pauses and asks the human. Deny leaves no PR.

3. **Effect ledger with rollback guard.** Every irreversible action is recorded with an idempotency key `sha256(kind|repo|branch|title)` *before* it is attempted (`pending → committed | failed`). Restores append a `restore` record; they never erase effects. If the agent retries a committed key, the tool refuses with `EffectAlreadyCommitted` citing the original PR URL and timestamp. That is the semantic-rollback defence.

Consequence: workspace edits need no approval because they are free to undo; approval concentrates where it means something.

## Architecture

```
Model (via TrueForge)
        │  6 MCP tools
        ▼
anvil-mcp  ── outer seam: the tool surface
        │
        │  resolution · str-replace edit · snapshot policy · ledger guard
        ▼
WorkspaceBackend ── inner seam: 7 primitive ops
        ├── LocalWorkspace   (fs + Docker exec)   ← shipped
        ├── DaytonaWorkspace (designed, out of scope for 42h)
        └── InMemoryWorkspace (tests)
```

TrueForge's only extension point is a **remote MCP connector by URL with header auth**; Anvil is that server.

## What does what

| Behaviour | Provided by |
| --- | --- |
| Agent loop, model calls, streaming | TrueForge |
| Tool approval gate (pause + Allow/Deny) | TrueForge |
| Dynamic subagent fan-out | TrueForge |
| Session persistence and reconnect | TrueForge |
| Context compaction, large-result offload | TrueForge |
| Workspace tool surface (read/edit/grep/exec) | **Anvil** |
| Automatic snapshots and restore | **Anvil** |
| Effect ledger and rollback guard | **Anvil** |
| Timeline UI (SSE) | **Anvil** |

This table is intentional: it answers the event's disqualification rule ("harness sitting under a thin wrapper") by showing the harness doing the work Anvil does not re-implement.

## Tool surface

| Tool | Signature | Mutating | Approval |
| --- | --- | --- | --- |
| `read` | `(path, offset?, limit?) → numbered lines` | no | no |
| `grep` | `(pattern, path?) → path:line: match` | no | no |
| `edit` | `(path, old_text, new_text) → edited path (snapshot id)` | yes | no (snapshotted) |
| `exec` | `(command, timeout_s?) → exit + stdout/stderr` | yes | no (sandboxed) |
| `snapshot` | `(action: take\|list\|restore, id?, label?)` | yes | no |
| `open_pr` | `(title, body, branch, base?) → PR url` | **egress** | **yes** |

`edit` requires a unique exact match; every mutating call snapshots first.

## Semantic rollback — the novelty

> A known agent failure is the *semantic rollback attack* where restoring a checkpoint causes an external side effect to be re-executed because the agent treats it as new. Anvil's ledger records that the irreversible effect already completed and refuses to silently re-fire it after a restore — a direct answer to arXiv 2603.20625.

Demo beat 5 exists solely to prove this: rollback past a committed `open_pr`, retry the same PR, watch the guard return the original URL as evidence.

## Quickstart

Prereqs: Node 22+, Bun 1.3+, Docker, a GitHub token with `repo` scope, and on Windows use Docker Desktop's Linux engine (TrueForge 0.1.4 standalone has a known `file://` bug on `win32`).

```bash
git clone https://github.com/StarLord824/anvil.git
cd anvil
cp .env.example .env   # set ANVIL_TOKEN, GITHUB_TOKEN, GITHUB_REPO
bun install

# 1. Prepare the demo workspace (already cloned via workspaces/demo)
#    To reset: rm -rf workspaces/demo && git clone https://github.com/StarLord824/anvil-demo-target.git workspaces/demo

# 2. Start Anvil
bun run src/index.ts
# → anvil listening on http://127.0.0.1:8791/mcp
# → timeline at http://127.0.0.1:8791/
# → health at http://127.0.0.1:8791/healthz

# 3. Start TrueForge
# Linux/macOS:
npx @truefoundry/trueforge
# Linux via Docker (also works on Windows via Docker Desktop):
#   git clone https://github.com/truefoundry/trueforge.git
#   cd trueforge && docker compose up
# Add an MCP connector in the harness UI:
#   URL: http://127.0.0.1:8791/mcp
#   Header: x-anvil-token = <ANVIL_TOKEN>
# Create an agent with require_approval_for_tools = ["open_pr"]

# Alternate: try the discovery helper
bun run scripts/setup-agent.ts
```

`docker-compose.yml` is provided for judges (`docker compose up` brings up `anvil` with its `anvil-sandbox:latest` sibling via the mounted Docker socket). Build the sandbox image first if not present: `docker build -t anvil-sandbox:latest sandbox`.

## Demo

See [`docs/DEMO.md`](docs/DEMO.md) for the fixed 6-beat, 3-minute script and the rehearsal checklist. `docs/superpowers/specs/2026-08-29-anvil-design.md` holds the full design.

## Qodo Code Review Evidence

Every substantive change was merged via a PR reviewed before merge. The review trail for this submission:

- #1 — [Task 1: scaffold, workspace seam, in-memory adapter](https://github.com/StarLord824/anvil/pull/1)
- #2 — [Task 2: git snapshot store + local adapter](https://github.com/StarLord824/anvil/pull/2)
- #3 — [Task 3: effect ledger + rollback guard](https://github.com/StarLord824/anvil/pull/3)
- #4 — [Task 4: MCP server + read/grep/edit/snapshot](https://github.com/StarLord824/anvil/pull/4)
- #5 — [Task 5: sandboxed exec](https://github.com/StarLord824/anvil/pull/5)
- #6 — [Task 6: egress tool + approval gate + harness wiring](https://github.com/StarLord824/anvil/pull/6) — notes the Windows standalone harness bug and the Docker compose workaround
- #7 — [Task 7: timeline UI](https://github.com/StarLord824/anvil/pull/7)

Qodo was installed after PR #1 due to fork timing; reviews from #2 onward carry the required evidence. Each PR's review comments (or the lack of Highs after fixes) are the track score.

## AI Assistance Disclosure

This project was built with AI coding assistance (Oh My Pi coding harness + subagents) during the event window 2026-08-24 → 2026-08-30, per the event rules. All generated code was reviewed, tested (`bun test`, `tsc --noEmit`), and understood by the authors; the design, demos, and write-up are original.

## Limitations (stated plainly)

- **Local backend only.** The Daytona adapter is designed behind the `WorkspaceBackend` seam but not shipped within the 42-hour window; `InMemoryWorkspace` covers tests.
- **Network enabled inside the sandbox.** The `exec` container is isolation via filesystem and process sandboxing with the workspace bind-mounted at `/work`; egress to the outside world is gated only by the `open_pr` approval and ledger, not by a network policy.
- **Harness on Windows.** TrueForge 0.1.4 standalone fails on `win32` with `LocalSandboxProvider supports macOS and Linux only` and a `file://` URL bug; the supported path on Windows is Docker compose via the Linux engine, as documented in `scripts/setup-agent.ts`.

## Repo

- Anvil: https://github.com/StarLord824/anvil
- Demo target: https://github.com/StarLord824/anvil-demo-target
- TrueForge: https://github.com/truefoundry/trueforge
