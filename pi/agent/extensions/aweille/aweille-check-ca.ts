import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Change, getCurrentChange, postReviewComment } from "./change.ts";
import { gitDiff } from "./forge.ts";
import { gitHost, gitHostOrThrow, requireGitHost, type GitHost } from "./git-host.ts";

const DIFF_LIMIT = 80_000;

function prompt(host: GitHost, change: Change, diff: string, truncated: boolean): string {
  return `Review ${host.changeShort} #${change.number} (${change.url}). Diff is preloaded; ${host.commentsOnly}

1. Load ponytail-review, then code-review-and-quality. If diff includes frontend code, also load frontend-design-review and frontend-ui-engineering.
2. Never edit code, tests, configuration, or Git history. Findings only.
3. Collect every finding: source skill, severity, file:line, issue, recommended fix.
4. Call aweille_post_review with all findings as Markdown. If none, post that no findings were found.
5. Alert user with every finding and a count.

## Diff
\`\`\`diff
${truncated ? `${diff}\n\n(diff truncated — inspect changed files for full context)` : diff || "(empty)"}
\`\`\``;
}

async function startReview(pi: ExtensionAPI, cwd: string, host: GitHost): Promise<string | null> {
  const change = await getCurrentChange(pi, cwd, host);
  if (!change) return `No open ${host.changeShort} found.`;
  const diff = await gitDiff(pi, cwd, change.base ?? "main");
  const truncated = diff.length > DIFF_LIMIT;
  pi.sendUserMessage(prompt(host, change, truncated ? diff.slice(0, DIFF_LIMIT) : diff, truncated));
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "aweille_post_review",
    label: "Aweille Post Review",
    description: "Post or update the aweille review comment and announce change:reviewed.",
    parameters: Type.Object({ body: Type.String() }),
    async execute(_id, { body }) {
      const cwd = process.cwd();
      const host = gitHostOrThrow(cwd);
      const change = await getCurrentChange(pi, cwd, host);
      if (!change) throw new Error(`No open ${host.changeShort} found.`);
      await postReviewComment(pi, cwd, host, change, body);
      pi.events.emit("change:reviewed", change);
      return { content: [{ type: "text", text: `Posted review on ${host.changeShort} #${change.number}.` }], details: { change } };
    },
  });

  pi.events.on("change:opened", async () => {
    const host = gitHost();
    if ("error" in host) {
      pi.sendUserMessage(`Cannot start review: ${host.error}`, { deliverAs: "followUp" });
      return;
    }
    const err = await startReview(pi, process.cwd(), host);
    if (err) pi.sendUserMessage(err, { deliverAs: "followUp" });
  });

  pi.registerCommand("aweille-check-ca", {
    description: "Review PR/MR with ponytail and quality skills; comment findings without changing code",
    handler: async (_args, ctx) => {
      const host = requireGitHost(ctx);
      if (!host) return;
      if (!await ctx.ui.confirm(`Review ${host.changeNoun}?`, `Posts findings as a simple comment on current ${host.changeShort}. Never changes code.`)) return;
      const err = await startReview(pi, ctx.cwd, host);
      if (err) ctx.ui.notify(err, "error");
    },
  });
}
