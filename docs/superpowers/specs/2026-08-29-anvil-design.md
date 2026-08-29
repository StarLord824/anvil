# Anvil — Design

**Date:** 2026-08-29
**Event:** TrueForge Agent Harness Hackathon (WeMakeDevs × TrueFoundry)
**Deadline:** 2026-08-30 19:00 UTC (20:00 London)
**Repo:** https://github.com/starlord824/anvil (public)
**Local:** `F:/Hackathons/aug26/trueforge`

## One sentence

Anvil is an execution layer for TrueForge agents where every workspace action is
reversible by construction, every irreversible action passes a human approval
gate, and rolling the workspace back can never silently re-fire an irreversible
action that already happened.

## Problem

Agents are given one of two permission models, and both are bad:

- **Ask every time.** The human approves 40 tool calls, stops reading, and the
  gate becomes theatre.
- **Ask never.** The agent is fast and the blast radius is the whole machine.

Checkpoint/restore ("undo for agents") is now shipped by Kiro, Claude Code,
Replit, and VS Code, so restore alone is not novel. What none of them handle is
the failure mode named in the literature as the **semantic rollback attack**
(arXiv 2603.20625): after a restore, the agent replays its plan and re-executes
an external side effect — a second PR, a second email, a second payment —
because the workspace forgot but the outside world did not.

## Solution

Three mechanisms, one thesis.

1. **Reversible workspace.** The agent's file edits and command runs happen in a
   snapshotted workspace. Snapshots are cheap (git plumbing) and taken
   automatically before every mutating tool call. Any snapshot can be restored.
2. **Egress gate.** Actions that leave the workspace (push, open PR) are a
   separate, small class of tool, annotated destructive and registered with
   TrueForge's `require_approval_for_tools`. The harness — not Anvil — pauses
   and asks the human.
3. **Effect ledger with rollback guard.** Every irreversible action is recorded
   with an idempotency key *before* it is attempted and marked committed after.
   Restores append a record; they never erase effects. If the agent retries an
   effect whose key is already committed, the tool refuses and returns the
   original record, timestamp, and URL as evidence.

Consequence: workspace edits need no approval because they are free to undo, and
approval concentrates where it means something. That is the "license to act"
theme the event asks for, implemented rather than asserted.

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
        ├── LocalWorkspace   (fs + docker exec)   ← built
        ├── DaytonaWorkspace (deferred, out of scope)
        └── InMemoryWorkspace (tests)
```

TrueForge's only extension point is a **remote MCP connector registered by
URL with header auth**. There is no plugin API and no local tool registration,
so the tool surface must be an HTTP MCP server. Anvil is that server.

### Division of labour (this table ships in the README)

| Behaviour | Provided by |
| --- | --- |
| Agent loop, model calls, streaming | TrueForge |
| Tool approval gate (pause + Allow/Deny) | TrueForge |
| Dynamic subagent fan-out | TrueForge |
| Session persistence and reconnect | TrueForge |
| Context compaction, large-result offload | TrueForge |
| Workspace tool surface (read/edit/grep/exec) | Anvil |
| Automatic snapshots and restore | Anvil |
| Effect ledger and rollback guard | Anvil |
| Timeline UI | Anvil |

Anvil deliberately does not re-implement anything in the TrueForge column. The
"thin wrapper" disqualification in the event rules cuts both ways; this table is
the defence.

## Inner seam

```ts
export interface WorkspaceBackend {
  list(path: string): Promise<Dirent[]>;
  stat(path: string): Promise<Stat | null>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  exec(argv: string[], opts: ExecOpts): Promise<ExecResult>;
  snapshot(op: "take" | "restore" | "list", id?: string): Promise<SnapshotInfo[]>;
}
```

Seven ops. Everything above the seam — path resolution, line selectors,
str-replace anchoring, snapshot policy, ledger, guard — is backend-agnostic
pure logic tested against `InMemoryWorkspace` with no container and no network.
Swapping in a Daytona backend later touches one file.

## Tool surface

Six tools. Names are prefixed `anvil.` by the connector.

| Tool | Signature | Mutating | Approval |
| --- | --- | --- | --- |
| `read` | `(path, offset?, limit?)` → numbered lines | no | no |
| `grep` | `(pattern, path?, glob?)` → matches with line numbers | no | no |
| `edit` | `(path, old_text, new_text)` → applied diff | yes | no (snapshotted) |
| `exec` | `(command, timeout_s?)` → stdout/stderr/exit | yes | no (sandboxed) |
| `snapshot` | `(action: take\|list\|restore, id?)` | yes | no |
| `open_pr` | `(title, body, branch)` → PR url | **egress** | **yes** |

`edit` uses exact-match str-replace with a uniqueness requirement: if
`old_text` occurs zero or multiple times, the tool fails without writing. This
is chosen over content-hash anchoring purely for schedule reasons.

Every mutating tool takes an automatic snapshot before acting, so rollback
granularity is one tool call.

## Ledger semantics

Append-only JSONL at `.anvil/ledger.jsonl`. Record kinds:

- `call` — tool name, args digest, snapshot id taken before it, timestamp
- `effect` — kind, idempotency key, status `pending` → `committed` | `failed`,
  external ref (PR url), timestamp
- `restore` — target snapshot id, list of effect keys still committed

Guard rule: `open_pr` computes `key = sha256(kind|repo|branch|title)`. If a
`committed` effect exists with that key, the tool returns a refusal containing
the original record. There is no force flag. Restores never delete effects.

## Safety model

- **Isolation.** `exec` runs inside a Docker container with the workspace
  bind-mounted at `/work`; the host filesystem is not reachable. Network stays
  enabled because dependency installs need it — stated plainly rather than
  overclaimed.
- **Reversibility.** Snapshots use git plumbing (`write-tree` / `commit-tree` /
  `read-tree -u --reset`) against the target repo, so ignored paths such as
  `node_modules` are excluded and snapshots are near-instant.
- **Irreversibility.** Only `open_pr` reaches outside, only it is
  approval-gated, and its effects are ledger-guarded.

## Demo (3 minutes, fixed beats)

1. 20s — the two bad permission models.
2. 50s — agent upgrades a dependency in a real repo: reads, greps, edits, runs
   tests. Timeline fills with snapshots. Subagent fan-out visible.
3. 30s — "that change was wrong" → restore one snapshot → tests green again.
4. 45s — agent goes for the PR → **TrueForge approval card** → Allow → PR
   appears → Qodo review lands on it.
5. 20s — rollback past the PR, agent retries, **guard refuses with evidence**.
6. 15s — the one-liner.

Beat 5 is the differentiator; it is the only beat no other submission can show.

## Scope

**In:** the six tools, local backend, docker exec, snapshots, ledger + guard,
timeline UI, TrueForge wiring script, README matrix, Qodo-reviewed PRs.

**Out, non-negotiable at 42 hours:** Daytona backend, hashline anchoring, LSP,
DAP, browser/desktop control, memory subsystem, address schemes beyond plain
paths, second external connector, React UI, provider routing, TUI.

## Requirements from the event rules

- Public repo, readable and runnable by a stranger.
- All coding inside 2026-08-24 → 2026-08-30.
- Substantive changes merged via PRs reviewed by Qodo; README carries a
  `## Qodo Code Review Evidence` section linking at least one.
- TrueForge visibly doing real work: tool reached, code run, pause before
  irreversible.
- Own keys and accounts only; no secrets in repo or video.
- ~3 minute demo video.
- AI coding-assistant use disclosed.

## Risks

| Risk | Mitigation |
| --- | --- |
| Git plumbing misbehaves on Windows paths | Backend normalises to POSIX separators; snapshot tests run first, Task 2 |
| Docker mount path translation on Windows | Convert `F:\x` → `/f/x` in one helper, covered by a test |
| TrueForge connector cannot reach localhost MCP | Both run on host; fall back to `host.docker.internal` if harness is containerised |
| Approval tool-name prefix differs from expectation | Verify against a live session in Task 6 before building the demo on it |
| Time | Task order is demo-beats-first: guard and approval land before the UI |
