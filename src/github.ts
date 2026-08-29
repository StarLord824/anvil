export interface CreatePullRequestOpts {
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface GitHubClient {
  createPullRequest(opts: CreatePullRequestOpts): Promise<string>;
}

export class RestGitHubClient implements GitHubClient {
  constructor(private readonly token: string) {}

  async createPullRequest(opts: CreatePullRequestOpts): Promise<string> {
    const response = await fetch(`https://api.github.com/repos/${opts.repo}/pulls`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        head: opts.head,
        base: opts.base,
      }),
    });
    if (!response.ok) {
      throw new Error(`github ${response.status}: ${await response.text()}`);
    }
    const payload = (await response.json()) as { html_url: string };
    return payload.html_url;
  }
}
