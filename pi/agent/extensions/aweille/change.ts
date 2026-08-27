import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cli, fail, git } from "./forge.ts";
import type { GitHost } from "./git-host.ts";

export const REVIEW_MARKER = "<!-- aweille-review -->";

export type Change = { number: number; url: string; base?: string };
export type Comment = {
  id: string;
  body: string;
  author?: string;
  threadId?: string;
  noteId?: string;
  url?: string;
  resolved?: boolean;
};

type GithubComment = { id: string; body: string; url: string; author?: { login?: string } };
type GithubThread = {
  id: string;
  isResolved: boolean;
  comments: { nodes: GithubComment[] };
};
type GitlabNote = { id: number; body?: string | null; author?: { username?: string }; resolved?: boolean; web_url?: string };
type GitlabDiscussion = { id: string; individual_note?: boolean; notes?: GitlabNote[] };

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

async function githubGraphql<T>(pi: ExtensionAPI, cwd: string, query: string, variables: string[] = []): Promise<T> {
  const result = await cli(pi, cwd, { cli: "gh" }, ["api", "graphql", "-f", `query=${query}`, ...variables]);
  if (result.code !== 0) fail(result, "gh api graphql");
  const response = parseJson<{ data?: T; errors?: Array<{ message?: string }> }>(result.stdout, "gh api graphql");
  if (response.errors?.length || !response.data) throw new Error(response.errors?.map((error) => error.message).join("\n") || "gh api graphql: no data");
  return response.data;
}

export async function getCurrentChange(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<Change | null> {
  if (host.kind === "github") {
    const result = await cli(pi, cwd, host, ["pr", "view", "--json", "number,url,baseRefName"]);
    if (result.code !== 0) return null;
    const data = parseJson<{ number: number; url: string; baseRefName?: string }>(result.stdout, "gh pr view");
    return { number: data.number, url: data.url, base: data.baseRefName };
  }
  const branch = (await git(pi, cwd, ["branch", "--show-current"])).stdout.trim();
  if (!branch) return null;
  const result = await cli(pi, cwd, host, ["mr", "list", "--source-branch", branch, "-F", "json"]);
  if (result.code !== 0) return null;
  const data = parseJson<Array<{ iid: number; web_url: string; target_branch?: string }>>(result.stdout, "glab mr list")[0];
  return data ? { number: data.iid, url: data.web_url, base: data.target_branch } : null;
}

export async function createChange(pi: ExtensionAPI, cwd: string, host: GitHost, title: string, body: string): Promise<Change> {
  const existing = await getCurrentChange(pi, cwd, host);
  if (existing) {
    const args = host.kind === "github"
      ? ["pr", "edit", String(existing.number), "--title", title, "--body", body]
      : ["mr", "update", String(existing.number), "-t", title, "-d", body, "-y"];
    const result = await cli(pi, cwd, host, args);
    if (result.code !== 0) fail(result, `${host.cli} ${host.changeShort.toLowerCase()} update`);
    return existing;
  }
  const args = host.kind === "github"
    ? ["pr", "create", "--title", title, "--body", body]
    : ["mr", "create", "--yes", "-t", title, "-d", body];
  const result = await cli(pi, cwd, host, args);
  if (result.code !== 0) fail(result, `${host.cli} ${host.changeShort.toLowerCase()} create`);
  const change = await getCurrentChange(pi, cwd, host);
  if (change) return change;
  const url = firstUrl(`${result.stdout}\n${result.stderr}`);
  const number = Number(url?.match(host.kind === "github" ? /\/pull\/(\d+)/ : /\/merge_requests\/(\d+)/)?.[1]);
  if (!url || !number) throw new Error(`${host.cli} ${host.changeShort.toLowerCase()} create: succeeded but could not resolve ${host.changeShort}`);
  return { number, url };
}

async function listGithubComments(pi: ExtensionAPI, cwd: string, change: Change): Promise<Comment[]> {
  const data = await githubGraphql<{ repository: { pullRequest: { comments: { nodes: GithubComment[] }; reviewThreads: { nodes: GithubThread[] } } | null } }>(
    pi,
    cwd,
    "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){comments(first:100){nodes{id body url author{login}}}reviewThreads(first:100){nodes{id isResolved comments(first:100){nodes{id body url author{login}}}}}}}}",
    ["-F", "owner={owner}", "-F", "name={repo}", "-F", `number=${change.number}`],
  );
  const pullRequest = data.repository.pullRequest;
  if (!pullRequest) throw new Error(`GitHub PR #${change.number} not found.`);
  return [
    ...pullRequest.comments.nodes.map((comment) => ({ id: comment.id, body: comment.body, author: comment.author?.login, url: comment.url })),
    ...pullRequest.reviewThreads.nodes.flatMap((thread) => {
      const comment = thread.comments.nodes[0];
      return comment ? [{ id: comment.id, body: comment.body, author: comment.author?.login, threadId: thread.id, url: comment.url, resolved: thread.isResolved }] : [];
    }),
  ];
}

async function listGitlabComments(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change): Promise<Comment[]> {
  const result = await cli(pi, cwd, host, ["api", "--paginate", `projects/:fullpath/merge_requests/${change.number}/discussions`]);
  if (result.code !== 0) fail(result, "glab api discussions");
  return parseJson<GitlabDiscussion[]>(result.stdout, "glab api discussions").flatMap((discussion) => {
    const note = discussion.notes?.[0];
    return note ? [{ id: discussion.id, body: note.body ?? "", author: note.author?.username, threadId: discussion.individual_note ? undefined : discussion.id, noteId: String(note.id), url: note.web_url, resolved: note.resolved }] : [];
  });
}

export async function listComments(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change): Promise<Comment[]> {
  return host.kind === "github" ? listGithubComments(pi, cwd, change) : listGitlabComments(pi, cwd, host, change);
}

export async function postReviewComment(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change, body: string): Promise<string> {
  const marked = body.includes(REVIEW_MARKER) ? body : `${REVIEW_MARKER}\n\n${body}`;
  const existing = (await listComments(pi, cwd, host, change)).find((comment) => !comment.threadId && comment.body.includes(REVIEW_MARKER));
  if (host.kind === "github") {
    if (existing) {
      await githubGraphql(pi, cwd, "mutation($id:ID!,$body:String!){updateIssueComment(input:{id:$id,body:$body}){issueComment{id}}}", ["-f", `id=${existing.id}`, "-f", `body=${marked}`]);
    } else {
      const result = await cli(pi, cwd, host, ["pr", "comment", String(change.number), "--body", marked]);
      if (result.code !== 0) fail(result, "gh pr comment");
    }
    return change.url;
  }
  if (existing) {
    const result = await cli(pi, cwd, host, ["api", "--method", "PUT", `projects/:fullpath/merge_requests/${change.number}/discussions/${existing.id}/notes/${existing.noteId}`, "-f", `body=${marked}`]);
    if (result.code !== 0) fail(result, "glab api comment update");
  } else {
    const result = await cli(pi, cwd, host, ["api", "--method", "POST", `projects/:fullpath/merge_requests/${change.number}/discussions`, "-f", `body=${marked}`]);
    if (result.code !== 0) fail(result, "glab api comment create");
  }
  return change.url;
}

export async function postInlineComment(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change, body: string, path: string, line: number, side: "LEFT" | "RIGHT" = "RIGHT"): Promise<string> {
  if (host.kind === "github") {
    const commit = await git(pi, cwd, ["rev-parse", "HEAD"]);
    if (commit.code !== 0) fail(commit, "git rev-parse HEAD");
    const result = await cli(pi, cwd, host, ["api", `repos/{owner}/{repo}/pulls/${change.number}/comments`, "-f", `body=${body}`, "-f", `commit_id=${commit.stdout.trim()}`, "-f", `path=${path}`, "-F", `line=${line}`, "-f", `side=${side}`]);
    if (result.code !== 0) fail(result, "gh api inline comment");
    return parseJson<{ html_url?: string }>(result.stdout, "gh api inline comment").html_url ?? change.url;
  }
  const versions = await cli(pi, cwd, host, ["api", `projects/:fullpath/merge_requests/${change.number}/versions`]);
  if (versions.code !== 0) fail(versions, "glab api MR versions");
  const version = parseJson<Array<{ base_commit_sha: string; head_commit_sha: string; start_commit_sha: string }>>(versions.stdout, "glab api MR versions")[0];
  if (!version) throw new Error(`GitLab MR #${change.number} has no diff version.`);
  const fields = [
    `body=${body}`,
    "position[position_type]=text",
    `position[base_sha]=${version.base_commit_sha}`,
    `position[head_sha]=${version.head_commit_sha}`,
    `position[start_sha]=${version.start_commit_sha}`,
    `position[old_path]=${path}`,
    `position[new_path]=${path}`,
    `position[${side === "RIGHT" ? "new" : "old"}_line]=${line}`,
  ];
  const result = await cli(pi, cwd, host, ["api", "--method", "POST", `projects/:fullpath/merge_requests/${change.number}/discussions`, ...fields.flatMap((field) => ["--form", field])]);
  if (result.code !== 0) fail(result, "glab api inline comment");
  const discussion = parseJson<{ notes?: Array<{ web_url?: string }> }>(result.stdout, "glab api inline comment");
  return discussion.notes?.[0]?.web_url ?? change.url;
}

export async function replyAndResolveComment(pi: ExtensionAPI, cwd: string, host: GitHost, change: Change, comment: Comment, body: string): Promise<void> {
  if (!comment.threadId) {
    if (host.kind === "github") {
      const result = await cli(pi, cwd, host, ["pr", "comment", String(change.number), "--body", `Re: ${comment.url ?? `#${comment.id}`}\n\n${body}`]);
      if (result.code !== 0) fail(result, "gh pr comment");
    } else {
      const result = await cli(pi, cwd, host, ["api", "--method", "POST", `projects/:fullpath/merge_requests/${change.number}/discussions/${comment.id}/notes`, "-f", `body=${body}`]);
      if (result.code !== 0) fail(result, "glab api comment reply");
    }
    return;
  }
  if (host.kind === "github") {
    await githubGraphql(pi, cwd, "mutation($thread:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$thread,body:$body}){comment{id}}}", ["-f", `thread=${comment.threadId}`, "-f", `body=${body}`]);
    await githubGraphql(pi, cwd, "mutation($thread:ID!){resolveReviewThread(input:{threadId:$thread}){thread{id}}}", ["-f", `thread=${comment.threadId}`]);
    return;
  }
  const reply = await cli(pi, cwd, host, ["api", "--method", "POST", `projects/:fullpath/merge_requests/${change.number}/discussions/${comment.threadId}/notes`, "-f", `body=${body}`]);
  if (reply.code !== 0) fail(reply, "glab api comment reply");
  const resolve = await cli(pi, cwd, host, ["api", "--method", "PUT", `projects/:fullpath/merge_requests/${change.number}/discussions/${comment.threadId}`, "-F", "resolved=true"]);
  if (resolve.code !== 0) fail(resolve, "glab api comment resolve");
}

export async function watchCi(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string> {
  const result = await cli(pi, cwd, host, host.kind === "github" ? ["pr", "checks", "--watch"] : ["ci", "status", "--live"]);
  const out = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0 && !out) fail(result, `${host.cli} ci watch`);
  return out || `exit ${result.code}`;
}

export async function createIssue(pi: ExtensionAPI, cwd: string, host: GitHost, title: string, body: string): Promise<string> {
  const result = await cli(pi, cwd, host, host.kind === "github" ? ["issue", "create", "--title", title, "--body", body] : ["issue", "create", "-t", title, "-d", body, "--yes"]);
  if (result.code !== 0) fail(result, `${host.cli} issue create`);
  const url = firstUrl(`${result.stdout}\n${result.stderr}`);
  if (!url) throw new Error(`${host.cli} issue create: succeeded but no URL in output`);
  return url;
}
