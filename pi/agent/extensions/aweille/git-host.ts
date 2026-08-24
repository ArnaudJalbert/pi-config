import { execFileSync } from "node:child_process";

export type GitHost = {
  kind: "github" | "gitlab";
  cli: "gh" | "glab";
  changeNoun: "pull request" | "merge request";
  changeShort: "PR" | "MR";
  commentsOnly: string;
};

type Ui = { notify: (msg: string, type: "error" | "warning" | "info") => void };

export function gitHost(cwd = process.cwd()): GitHost | { error: string } {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8" }).trim().toLowerCase();
    const github = url.includes("github");
    const gitlab = url.includes("gitlab");
    if (github === gitlab) {
      throw new Error(
        github ? `origin remote looks like both GitHub and GitLab: ${url}` : `origin remote is neither GitHub nor GitLab: ${url}`,
      );
    }
    const cli = github ? "gh" as const : "glab" as const;
    return {
      kind: github ? "github" : "gitlab",
      cli,
      changeNoun: github ? "pull request" : "merge request",
      changeShort: github ? "PR" : "MR",
      commentsOnly: `Use only simple comment threads via ${cli}; never submit reviews.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function requireGitHost(ctx: { ui: Ui }): GitHost | null {
  const host = gitHost();
  if ("error" in host) {
    ctx.ui.notify(host.error, "error");
    return null;
  }
  return host;
}
