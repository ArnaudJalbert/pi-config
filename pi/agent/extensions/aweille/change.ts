import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cli } from "./forge.ts";
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

function fail(result: { code: number; stdout: string; stderr: string }, action: string): never {
  throw new Error(`${action}: ${(result.stderr || result.stdout).trim() || `exit ${result.code}`}`);
}

export async function getCurrentChange(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<Change | null> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "view", "--json", "number,url,baseRefName"]);
    if (result.code !== 0) return null;
    const data = parseJson<{ number: number; url: string; baseRefName?: string }>(result.stdout, "gh pr view");
    return { number: data.number, url: data.url, base: data.baseRefName };
  }

  const result = await cli(pi, cwd, host, ["mr", "view", "-F", "json"]);
  if (result.code !== 0) return null;
  const data = parseJson<{ iid: number; web_url: string; target_branch?: string }>(result.stdout, "glab mr view");
  return { number: data.iid, url: data.web_url, base: data.target_branch };
}

export async function createChange(
  pi: ExtensionAPI,
  cwd: string,
  host: GitHost,
  title: string,
  body: string,
): Promise<Change> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "create", "--title", title, "--body", body, "--json", "number,url"]);
    if (result.code !== 0) fail(result, "gh pr create");
    return parseJson<Change>(result.stdout, "gh pr create");
  }

  const result = await cli(pi, cwd, host, ["mr", "create", "--yes", "-t", title, "-d", body, "-F", "json"]);
  if (result.code !== 0) fail(result, "glab mr create");
  const data = parseJson<{ iid: number; web_url: string }>(result.stdout, "glab mr create");
  return { number: data.iid, url: data.web_url };
}

async function githubRepo(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string> {
  const result = await cli(pi, cwd, host, ["repo", "view", "--json", "nameWithOwner"]);
  if (result.code !== 0) fail(result, "gh repo view");
  const data = parseJson<{ nameWithOwner: string }>(result.stdout, "gh repo view");
  return data.nameWithOwner;
}

export async function listComments(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change): Promise<Comment[]> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "view", String(change.number), "--json", "comments"]);
    if (result.code !== 0) fail(result, "gh pr view --comments");
    const data = parseJson<{ comments: Array<{ id: string; body: string; author?: { login?: string } }> }>(
      result.stdout,
      "gh pr view",
    );
    return data.comments.map((c) => ({ id: c.id, body: c.body, author: c.author?.login }));
  }

  const result = await cli(pi, cwd, host, ["mr", "note", "list", String(change.number), "-F", "json"]);
  if (result.code !== 0) fail(result, "glab mr note list");
  const data = parseJson<Array<{ id: number; body: string; author?: { username?: string } }>>(result.stdout, "glab mr note list");
  return data.map((c) => ({ id: String(c.id), body: c.body, author: c.author?.username }));
}

export async function postReviewComment(
  pi: ExtensionAPI,
  cwd: string,
  host: GitHost,
  change: Change,
  body: string,
): Promise<string> {
  const marked = body.includes(REVIEW_MARKER) ? body : `${REVIEW_MARKER}\n\n${body}`;
  const comments = await listComments(pi, cwd, host, change);
  const existing = comments.find((c) => c.body.includes(REVIEW_MARKER));

  if (host.kind === "github") {
    if (existing) {
      const repo = await githubRepo(pi, cwd, host);
      const result = await cli(pi, cwd, host, [
        "api",
        "--method",
        "PATCH",
        `repos/${repo}/issues/comments/${existing.id}`,
        "-f",
        `body=${marked}`,
      ]);
      if (result.code !== 0) fail(result, "gh api comment update");
      return `https://github.com/${repo}/pull/${change.number}#issuecomment-${existing.id}`;
    }
    const result = await cli(pi, cwd, host, ["pr", "comment", String(change.number), "--body", marked]);
    if (result.code !== 0) fail(result, "gh pr comment");
    return result.stdout.trim() || change.url;
  }

  if (existing) {
    const result = await cli(pi, cwd, host, ["mr", "note", "update", existing.id, String(change.number), "-m", marked]);
    if (result.code !== 0) fail(result, "glab mr note update");
    return change.url;
  }
  const result = await cli(pi, cwd, host, ["mr", "note", "create", String(change.number), "-m", marked]);
  if (result.code !== 0) fail(result, "glab mr note create");
  return change.url;
}

export async function replyComment(
  pi: ExtensionAPI,
  cwd: string,
  host: GitHost,
  change: Change,
  commentId: string,
  body: string,
): Promise<void> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "comment", String(change.number), "--body", `> re #${commentId}\n\n${body}`]);
    if (result.code !== 0) fail(result, "gh pr comment");
    return;
  }
  const result = await cli(pi, cwd, host, ["mr", "note", "create", String(change.number), "--reply", commentId, "-m", body]);
  if (result.code !== 0) fail(result, "glab mr note create --reply");
}

export async function watchCi(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string> {
  const args = host.kind === "github" ? ["pr", "checks", "--watch"] : ["ci", "status", "--live"];
  const result = await cli(pi, cwd, host, args);
  const out = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0 && !out) fail(result, `${host.cli} ci watch`);
  return out || `exit ${result.code}`;
}

export async function createIssue(pi: ExtensionAPI, cwd: string, host: GitHost, title: string, body: string): Promise<string> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["issue", "create", "--title", title, "--body", body, "--json", "url"]);
    if (result.code !== 0) fail(result, "gh issue create");
    const data = parseJson<{ url: string }>(result.stdout, "gh issue create");
    return data.url;
  }
  const result = await cli(pi, cwd, host, ["issue", "create", "-t", title, "-d", body, "-F", "json"]);
  if (result.code !== 0) fail(result, "glab issue create");
  const data = parseJson<{ web_url: string }>(result.stdout, "glab issue create");
  return data.web_url;
}
