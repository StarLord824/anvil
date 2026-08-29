import { type Ledger, effectKey } from "../ledger/ledger";

export interface OpenPrArgs {
  title: string;
  body: string;
  branch: string;
  base?: string;
}

export interface OpenPrDeps {
  ledger: Ledger;
  repo: string;
  pushBranch(branch: string): Promise<void>;
  github: {
    createPullRequest(opts: {
      repo: string;
      title: string;
      body: string;
      head: string;
      base: string;
    }): Promise<string>;
  };
}

export async function openPrTool(
  deps: OpenPrDeps,
  args: OpenPrArgs,
): Promise<{ text: string }> {
  const key = effectKey("open_pr", [deps.repo, args.branch, args.title]);
  await deps.ledger.assertEffectAllowed(key);
  await deps.ledger.beginEffect("open_pr", key);
  try {
    await deps.pushBranch(args.branch);
    const url = await deps.github.createPullRequest({
      repo: deps.repo,
      title: args.title,
      body: args.body,
      head: args.branch,
      base: args.base ?? "main",
    });
    await deps.ledger.commitEffect(key, url);
    return { text: `opened ${url}` };
  } catch (error) {
    await deps.ledger.failEffect(key, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
