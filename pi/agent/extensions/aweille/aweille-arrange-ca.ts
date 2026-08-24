import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Change, type Comment, getCurrentChange, listComments, replyComment } from "./change.ts";
import { readContributing } from "./forge.ts";
import { gitHost, requireGitHost, type GitHost } from "./git-host.ts";

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

function applyPrompt(host: GitHost, change: Change, comments: Comment[], contributing: string | null): string {
  const guide = contributing?.trim()
    ? `## CONTRIBUTING.md\n\n${contributing}`
    : "## CONTRIBUTING.md\n\n(not found)";

  return `Implement the approved ${host.changeShort} review plan. Comments are preloaded; ${host.commentsOnly}

1. Change only approved findings. Follow repository architecture and CONTRIBUTING.md verification rules.
2. For each addressed finding, call aweille_reply with comment id and reply body.
3. Do not commit, open/reopen ${host.changeShort}, or start a review.

${guide}

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
    parameters: Type.Object({
      commentId: Type.String(),
      body: Type.String(),
    }),
    async execute(_id, { commentId, body }) {
      const host = gitHost(cwd());
      if ("error" in host) throw new Error(host.error);
      const change = await getCurrentChange(pi, cwd(), host);
      if (!change) throw new Error(`No open ${host.changeShort} found.`);
      await replyComment(pi, cwd(), host, change, commentId, body);
      return { content: [{ type: "text", text: `Replied on #${commentId}.` }] };
    },
  });

  pi.events.on("change:reviewed", async (change: Change) => {
    const host = gitHost();
    if ("error" in host) {
      pi.sendUserMessage(`Cannot plan fixes: ${host.error}`, { deliverAs: "followUp" });
      return;
    }
    const comments = await listComments(pi, cwd(), host, change);
    pi.sendUserMessage(planPrompt(host, change, comments), { deliverAs: "followUp" });
  });

  pi.registerCommand("aweille-arrange-ca", {
    description: "Plan PR/MR-review fixes, or apply approved plan and reply to addressed threads",
    handler: async (args, ctx) => {
      if (args.trim() !== "apply") {
        ctx.ui.notify("Waiting for change:reviewed. Use /aweille-arrange-ca apply after approving plan.", "info");
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
      const comments = await listComments(pi, ctx.cwd, host, change);
      pi.sendUserMessage(applyPrompt(host, change, comments, await readContributing(ctx.cwd)));
    },
  });
}
