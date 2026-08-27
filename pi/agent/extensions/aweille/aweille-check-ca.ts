import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type Change, getCurrentChange, postInlineComment, postReviewComment } from "./change.ts";
import { gitDiff } from "./forge.ts";
import { gitHost, gitHostOrThrow, requireGitHost, type GitHost } from "./git-host.ts";

const DIFF_LIMIT = 80_000;

function prompt(host: GitHost, change: Change, diff: string, truncated: boolean): string {
  return `Review ${host.changeShort} #${change.number} (${change.url}). Diff is preloaded; ${host.commentsOnly}

1. Load ponytail-review, then code-review-and-quality. If diff includes frontend code, also load frontend-design-review and frontend-ui-engineering.
2. Never edit code, tests, configuration, or Git history. Findings only.
3. For each code-specific finding, call aweille_inline_comment on exact changed line or smallest relevant range. Only use general review summary for findings that apply to entire change and have no specific line.
4. In findings summary, always include each aweille_inline_comment URL. Include source skill, severity, file:line, issue, recommended fix, and inline-comment URL.
5. Call aweille_post_review with the findings summary as Markdown. If none, post that no findings were found.
6. Alert user with every finding and a count.

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
  pi.sendUserMessage(prompt(host, change, truncated ? diff.slice(0, DIFF_LIMIT) : diff, truncated), { deliverAs: "followUp" });
  return null;
}

export default function (pi: ExtensionAPI) {
  const cwd = () => process.cwd();

  pi.registerTool({
    name: "aweille_inline_comment",
    label: "Aweille Inline Comment",
    description: "Post an inline review comment on an exact changed PR/MR line and return its URL.",
    parameters: Type.Object({
      body: Type.String(),
      path: Type.String(),
      line: Type.Integer({ minimum: 1 }),
      side: Type.Optional(Type.String()),
    }),
    async execute(_id, { body, path, line, side }) {
      const host = gitHostOrThrow(cwd());
      const change = await getCurrentChange(pi, cwd(), host);
      if (!change) throw new Error(`No open ${host.changeShort} found.`);
      const url = await postInlineComment(pi, cwd(), host, change, body, path, line, side === "LEFT" ? "LEFT" : "RIGHT");
      return { content: [{ type: "text", text: `Posted inline comment: ${url}` }], details: { url } };
    },
  });

  pi.registerTool({
    name: "aweille_post_review",
    label: "Aweille Post Review",
    description: "Post or update the aweille review comment and announce change:reviewed.",
    parameters: Type.Object({ body: Type.String() }),
    async execute(_id, { body }) {
      const host = gitHostOrThrow(cwd());
      const change = await getCurrentChange(pi, cwd(), host);
      if (!change) throw new Error(`No open ${host.changeShort} found.`);
      await postReviewComment(pi, cwd(), host, change, body);
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
      if (!await ctx.ui.confirm(`Review ${host.changeNoun}?`, `Posts findings inline and as a summary comment on current ${host.changeShort}. Never changes code.`)) return;
      const err = await startReview(pi, ctx.cwd, host);
      if (err) ctx.ui.notify(err, "error");
    },
  });
}
