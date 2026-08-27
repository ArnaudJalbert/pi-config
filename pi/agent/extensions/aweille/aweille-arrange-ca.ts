import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Change, type Comment, getCurrentChange, listComments, replyAndResolveComment } from "./change.ts";
import { contributingSection, readContributing } from "./forge.ts";
import { gitHost, gitHostOrThrow, requireGitHost, type GitHost } from "./git-host.ts";

function formatComments(comments: Comment[]): string {
  const actionable = comments.filter((comment) => !comment.resolved && !comment.body.includes("<!-- aweille-review -->"));
  if (!actionable.length) return "(no actionable comments)";
  return actionable.map((comment) => `### #${comment.id}${comment.author ? ` (${comment.author})` : ""}\n${comment.body}`).join("\n\n");
}

function planPrompt(host: GitHost, change: Change, comments: Comment[], revise = false): string {
  return `${revise ? "Revise" : "Plan"} fixes for ${host.changeShort} #${change.number} (${change.url}). Comments are preloaded; ${host.commentsOnly}

${revise ? "Ask the user what they want changed in proposed plan, then update plan accordingly. Do not implement fixes until user chooses Apply approved plan." : ""}

1. Identify actionable findings, excluding bot noise and resolved items.
2. Do not edit files, run formatting, create commits, or post comments.
3. Present smallest plan: one item per finding, files, intended change, verification. State skipped findings and why.

## Comments
${formatComments(comments)}`;
}

async function startPlan(pi: ExtensionAPI, cwd: string, host: GitHost, revise = false): Promise<string | null> {
  const change = await getCurrentChange(pi, cwd, host);
  if (!change) return `No open ${host.changeShort} found.`;
  pi.sendUserMessage(planPrompt(host, change, await listComments(pi, cwd, host, change), revise), { deliverAs: "followUp" });
  return null;
}

function applyPrompt(host: GitHost, change: Change, comments: Comment[], contributing: string | null): string {
  return `Implement the approved ${host.changeShort} review plan. Comments are preloaded; ${host.commentsOnly}

1. Change only approved findings. Follow repository architecture and CONTRIBUTING.md verification rules.
2. For each addressed finding, call aweille_reply with comment id and reply body. It replies in the original thread and resolves it.
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
    description: "Reply on a review comment thread and resolve it.",
    parameters: Type.Object({ commentId: Type.String(), body: Type.String() }),
    async execute(_id, { commentId, body }) {
      const host = gitHostOrThrow(cwd());
      const change = await getCurrentChange(pi, cwd(), host);
      if (!change) throw new Error(`No open ${host.changeShort} found.`);
      const comment = (await listComments(pi, cwd(), host, change)).find((item) => item.id === commentId);
      if (!comment) throw new Error(`Comment #${commentId} not found.`);
      await replyAndResolveComment(pi, cwd(), host, change, comment, body);
      return { content: [{ type: "text", text: comment.threadId ? `Replied on and resolved #${commentId}.` : `Replied on #${commentId}.` }] };
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
    handler: async (_args, ctx) => {
      const host = requireGitHost(ctx);
      if (!host) return;
      const choice = await ctx.ui.select(`What should happen with ${host.changeShort} review fixes?`, [
        "Plan fixes",
        "Propose changes to plan",
        "Apply approved plan",
        "Cancel",
      ]);
      if (!choice || choice === "Cancel") return;
      if (choice === "Plan fixes" || choice === "Propose changes to plan") {
        const err = await startPlan(pi, ctx.cwd, host, choice === "Propose changes to plan");
        if (err) ctx.ui.notify(err, "error");
        return;
      }
      const change = await getCurrentChange(pi, ctx.cwd, host);
      if (!change) {
        ctx.ui.notify(`No open ${host.changeShort} found.`, "error");
        return;
      }
      pi.sendUserMessage(applyPrompt(host, change, await listComments(pi, ctx.cwd, host, change), await readContributing(ctx.cwd)), { deliverAs: "followUp" });
    },
  });
}
