# Demo Script — 6 Beats, ~180s

Target repo: `StarLord824/anvil-demo-target` cloned to `workspaces/demo`.
Anvil: `http://127.0.0.1:8791`  (compose) or `bun run src/index.ts` locally.
Harness: TrueForge (requires Linux/macOS or `docker compose up` from https://github.com/truefoundry/trueforge).
Timeline UI: `http://127.0.0.1:8791/`

## Beat 1 — The two bad models (20s)

> "Agents today either ask 40 times or run with no guard. Anvil makes every
> workspace action reversible and every irreversible action approved."

Show: timeline UI empty, `workspaces/demo` git log clean.

## Beat 2 — Agent works fast (50s)

Prompt (via harness):

```
In workspaces/demo, upgrade lodash from 4.17.19 to 4.17.21. Steps:
1. read package.json
2. edit the lodash version
3. exec "npm install"
4. exec "npm test"
Do not open a PR yet.
```

Show: harness streaming tool calls `read` → `edit` (snapshot) → `exec` (snapshot) → `exec`. Timeline fills with snapshots. `workspaces/demo/.anvil/ledger.jsonl` grows. Highlight that each edit/exec was snapshotted.

## Beat 3 — Break it, roll it back (30s)

Say: "that first edit was wrong" — click **Rollback** on the first snapshot in the timeline (or `POST /api/rollback`).

Show: `read package.json` reverts to 4.17.19, `npm test` would fail/pass accordingly, ledger shows `restore` with prior snapshots still listed. Snapshots survive because `.anvil` is ignored.

## Beat 4 — Egress + approval (45s)

Prompt:

```
Now redo the lodash upgrade 4.17.19 → 4.17.21, run npm install && npm test, and if tests pass open a PR titled "chore: bump lodash 4.17.19 → 4.17.21" on branch chore/bump-lodash.
```

Show: agent does the same edits/execs, then calls `open_pr`. Harness **pauses with approval card** for `open_pr` (destructive, openWorld). Deny vs Allow. Click **Allow**. Show `opened https://github.com/StarLord824/anvil-demo-target/pull/N` in tool result and ledger effect `committed`.

## Beat 5 — Rollback cannot re-fire the PR (20s)

Immediately rollback to the snapshot before `open_pr` (timeline or API). Prompt:

```
Retry: open the same PR again (same title, same branch).
```

Show: `open_pr` **refuses** with `EffectAlreadyCommitted` and cites the original PR URL, timestamp, and that the workspace rollback did not undo the outside world. Re-show ledger: the committed effect is still there, restore recorded it as surviving.

## Beat 6 — The one-liner (15s)

> "Anvil is git for agent actions — the agent can run free because nothing it does can't be wound back, and nothing irreversible can be silently re-done when you do."

Show: `docs/superpowers/specs/2026-08-29-anvil-design.md` division-of-labour table, Qodo PR list, sandbox exec.

---

## Rehearsal checklist (2×)

- [ ] `workspaces/demo` clean (`git status` shows nothing but `.anvil` ignored)
- [ ] `curl http://127.0.0.1:8791/healthz` → `{"ok":true}`
- [ ] `curl http://127.0.0.1:8791/api/ledger` → empty or only prior demo records
- [ ] Beat 3 rollback reverts file and preserves `snapshots.jsonl`
- [ ] Beat 4 approval card names `open_pr`
- [ ] Beat 5 guard returns PR URL as evidence
- [ ] Video captures ledger/timeline, approval card, and guard refusal legibly
- [ ] No secrets visible
