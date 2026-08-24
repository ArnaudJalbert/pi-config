import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Change, type Comment, getCurrentChange, listComments, replyComment } from "./change.ts";
import { contributingSection, readContributing } from "./forge.ts";
import { gitHost, gitHostOrThrow, requireGitHost, type GitHost } from "./git-host.ts";

function formatComments(comments: Comment[]): string {
  if (!comments.length) return "(no comments)";
  return comments.map((c) => `### #${c.id}${c.author ? ` (${c.author})` : ""}\n${c.body}`).join("\n\n");
}

function planPrompt(host: GitHost, change: Change, comments: Comment[]): string {
  return `Plan fixes for ${host.changeShort} #${change.number} (${change.url}). Comments are preloaded; ${host.commentsOnly}

1. Identify actionable findings, excluding bot noise and resolved items.
2. Do not edit files, run formatting, create commits, or post comments.
3. Present smallest plan: one item per finding, files, intended change, verification. State skipped findings and why.
4. End with: "Approve with /aweille-arrange-ca apply."

## Comments
${formatComments(comments)}`;
}

async function startPlan(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string | null> {
  const change = await getCurrentChange(pi, cwd, host);
  if (!change) return `No open ${host.changeShort} found.`;
  pi.sendUserMessage(planPrompt(host, change, await listComments(pi, cwd, host, change)), { deliverAs: "followUp" });
  return null;
}

function applyPrompt(host: GitHost, change: Change, comments: Comment[], contributing: string | null): string {
  return `Implement the approved ${host.changeShort} review plan. Comments are preloaded; ${host.commentsOnly}

1. Change only approved findings. Follow repository architecture and CONTRIBUTING.md verification rules.
2. For each addressed finding, call aweille_reply with comment id and reply body.
3. Do not commit, open/reopen ${host.changeShort}, or start a review.

${contributingSection(contributing, "not found")}

## ${host.changeShort} #${change.number}
${change.url}

## Comments
${formatComments(comments)}`;
}

export default function (pi: ExtensionAPI) {
  const cwd = () => process.cwd();

  pi.registerTool({
    name: "aweille_reply",
    label: "Aweille Reply",
    description: "Reply on a simple comment/discussion thread.",
    parameters: Type.Object({ commentId: Type.String(), body: Type.String() }),
    async execute(_id, { commentId, body }) {
      const host = gitHostOrThrow(cwd());
      const change = await getCurrentChange(pi, cwd(), host);
      if (!change) throw new Error(`No open ${host.changeShort} found.`);
      await replyComment(pi, cwd(), host, change, commentId, body);
      return { content: [{ type: "text", text: `Replied on #${commentId}.` }] };
    },
  });

  pi.events.on("change:reviewed", async () => {
    const host = gitHost();
    if ("error" in host) {
      pi.sendUserMessage(`Cannot plan fixes: ${host.error}`, { deliverAs: "followUp" });
      return;
    }
    const err = await startPlan(pi, cwd(), host);
    if (err) pi.sendUserMessage(err, { deliverAs: "followUp" });
  });

  pi.registerCommand("aweille-arrange-ca", {
    description: "Plan PR/MR-review fixes from comments, or apply approved plan and reply to addressed threads",
    handler: async (args, ctx) => {
      const sub = args.trim();
      if (sub !== "apply") {
        const host = requireGitHost(ctx);
        if (!host) return;
        if (!await ctx.ui.confirm(`Plan ${host.changeShort} review fixes?`, `Reads current ${host.changeShort} comments and drafts a fix plan. Does not edit files.`)) return;
        const err = await startPlan(pi, ctx.cwd, host);
        if (err) ctx.ui.notify(err, "error");
        return;
      }
      const host = requireGitHost(ctx);
      if (!host) return;
      if (!await ctx.ui.confirm("Apply approved review plan?", `Changes files and replies on simple ${host.changeShort} comment threads. Does not commit or open ${host.changeShort}.`)) return;

      const change = await getCurrentChange(pi, ctx.cwd, host);
      if (!change) {
        ctx.ui.notify(`No open ${host.changeShort} found.`, "error");
        return;
      }
      pi.sendUserMessage(applyPrompt(host, change, await listComments(pi, ctx.cwd, host, change), await readContributing(ctx.cwd)), { deliverAs: "followUp" });
    },
  });
}
