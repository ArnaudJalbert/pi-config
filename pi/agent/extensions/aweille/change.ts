import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cli, fail } from "./forge.ts";
import type { GitHost } from "./git-host.ts";

export const REVIEW_MARKER = "<!-- aweille-review -->";

export type Change = { number: number; url: string; base?: string };

export type Comment = { id: string; body: string; author?: string };

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label}: malformed JSON`);
  }
}

function firstUrl(text: string): string | null {
  return text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

export async function getCurrentChange(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<Change | null> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "view", "--json", "number,url,baseRefName"]);
    if (result.code !== 0) return null;
    const data = parseJson<{ number: number; url: string; baseRefName?: string }>(result.stdout, "gh pr view");
    return { number: data.number, url: data.url, base: data.baseRefName };
  }
  // Prefer mr list over mr view: view fails when open+closed MRs share a branch
  const branch = (await pi.exec("git", ["branch", "--show-current"], { cwd, timeout: 30_000 })).stdout?.trim() ?? "";
  if (!branch) return null;
  const result = await cli(pi, cwd, host, ["mr", "list", "--source-branch", branch, "-F", "json"]);
  if (result.code !== 0) return null;
  const list = parseJson<Array<{ iid: number; web_url: string; target_branch?: string }>>(result.stdout, "glab mr list");
  const data = list[0];
  return data ? { number: data.iid, url: data.web_url, base: data.target_branch } : null;
}

export async function createChange(pi: ExtensionAPI, cwd: string, host: GitHost, title: string, body: string): Promise<Change> {
  if (host.kind === "github") {
    const existing = await getCurrentChange(pi, cwd, host);
    if (existing) {
      const result = await cli(pi, cwd, host, ["pr", "edit", String(existing.number), "--title", title, "--body", body]);
      if (result.code !== 0) fail(result, "gh pr edit");
      return existing;
    }
    const result = await cli(pi, cwd, host, ["pr", "create", "--title", title, "--body", body, "--json", "number,url"]);
    if (result.code !== 0) fail(result, "gh pr create");
    return parseJson<Change>(result.stdout, "gh pr create");
  }

  const existing = await getCurrentChange(pi, cwd, host);
  if (existing) {
    const result = await cli(pi, cwd, host, ["mr", "update", String(existing.number), "-t", title, "-d", body, "-y"]);
    if (result.code !== 0) fail(result, "glab mr update");
    return existing;
  }

  // glab mr create has no -F/--output; resolve via list or URL in text output
  const result = await cli(pi, cwd, host, ["mr", "create", "--yes", "-t", title, "-d", body]);
  if (result.code !== 0) fail(result, "glab mr create");
  const change = await getCurrentChange(pi, cwd, host);
  if (change) return change;
  const url = firstUrl(`${result.stdout}\n${result.stderr}`);
  const number = Number(url?.match(/\/merge_requests\/(\d+)/)?.[1]);
  if (!url || !number) throw new Error("glab mr create: succeeded but could not resolve MR");
  return { number, url };
}

async function githubRepo(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string> {
  const result = await cli(pi, cwd, host, ["repo", "view", "--json", "nameWithOwner"]);
  if (result.code !== 0) fail(result, "gh repo view");
  return parseJson<{ nameWithOwner: string }>(result.stdout, "gh repo view").nameWithOwner;
}

export async function listComments(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change): Promise<Comment[]> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "view", String(change.number), "--json", "comments"]);
    if (result.code !== 0) fail(result, "gh pr view --comments");
    const data = parseJson<{ comments: Array<{ id: string; body?: string; author?: { login?: string } }> }>(result.stdout, "gh pr view");
    return data.comments.map((c) => ({ id: c.id, body: c.body ?? "", author: c.author?.login }));
  }
  // glab mr note list -F json returns discussions with nested notes[], not flat comments
  const result = await cli(pi, cwd, host, ["mr", "note", "list", String(change.number), "-F", "json"]);
  if (result.code !== 0) fail(result, "glab mr note list");
  type Note = { id: number; body?: string | null; author?: { username?: string } };
  return parseJson<Array<{ notes?: Note[] | null }>>(result.stdout, "glab mr note list")
    .flatMap((d) => d.notes ?? [])
    .map((c) => ({ id: String(c.id), body: c.body ?? "", author: c.author?.username }));
}

export async function postReviewComment(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change, body: string): Promise<string> {
  const marked = body.includes(REVIEW_MARKER) ? body : `${REVIEW_MARKER}\n\n${body}`;
  const existing = (await listComments(pi, cwd, host, change)).find((c) => c.body.includes(REVIEW_MARKER));

  if (host.kind === "github") {
    if (existing) {
      const repo = await githubRepo(pi, cwd, host);
      const result = await cli(pi, cwd, host, ["api", "--method", "PATCH", `repos/${repo}/issues/comments/${existing.id}`, "-f", `body=${marked}`]);
      if (result.code !== 0) fail(result, "gh api comment update");
      return change.url;
    }
    const result = await cli(pi, cwd, host, ["pr", "comment", String(change.number), "--body", marked]);
    if (result.code !== 0) fail(result, "gh pr comment");
    return change.url;
  }
  const cmd = existing
    ? ["mr", "note", "update", existing.id, String(change.number), "-m", marked]
    : ["mr", "note", "create", String(change.number), "-m", marked];
  const result = await cli(pi, cwd, host, cmd);
  if (result.code !== 0) fail(result, existing ? "glab mr note update" : "glab mr note create");
  return change.url;
}

export async function replyComment(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change, commentId: string, body: string): Promise<void> {
  const args = host.kind === "github"
    ? ["pr", "comment", String(change.number), "--body", `> re #${commentId}\n\n${body}`]
    : ["mr", "note", "create", String(change.number), "--reply", commentId, "-m", body];
  const result = await cli(pi, cwd, host, args);
  if (result.code !== 0) fail(result, host.kind === "github" ? "gh pr comment" : "glab mr note create --reply");
}

export async function watchCi(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string> {
  const result = await cli(pi, cwd, host, host.kind === "github" ? ["pr", "checks", "--watch"] : ["ci", "status", "--live"]);
  const out = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0 && !out) fail(result, `${host.cli} ci watch`);
  return out || `exit ${result.code}`;
}

export async function createIssue(pi: ExtensionAPI, cwd: string, host: GitHost, title: string, body: string): Promise<string> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["issue", "create", "--title", title, "--body", body, "--json", "url"]);
    if (result.code !== 0) fail(result, "gh issue create");
    return parseJson<{ url: string }>(result.stdout, "gh issue create").url;
  }
  // glab issue create has no -F/--output
  const result = await cli(pi, cwd, host, ["issue", "create", "-t", title, "-d", body, "--yes"]);
  if (result.code !== 0) fail(result, "glab issue create");
  const url = firstUrl(`${result.stdout}\n${result.stderr}`);
  if (!url) throw new Error("glab issue create: succeeded but no URL in output");
  return url;
}
